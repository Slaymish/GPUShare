"""Model picker — live recommendations from OpenRouter + local VRAM logic."""

from __future__ import annotations

import asyncio
import logging
import time

import httpx
from fastapi import APIRouter

from app.backend_client import _make_internal_headers, get_backend_client
from app.cache import cache as _ttl_cache
from app.config import get_settings

OPENROUTER_BASE = "https://openrouter.ai/api/v1"

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/model-picker", tags=["model-picker"])

CACHE_TTL = 6 * 3600  # 6 hours

# ── VRAM & speed estimation ──────────────────────────────────────────────────

# Known parameter counts (billions) for common local models
_KNOWN_PARAMS_B: dict[str, float] = {
    "llama3.2:3b": 3.2,
    "llama3.2:8b": 8.0,
    "llama3.1:8b": 8.0,
    "llama3.1:70b": 70.0,
    "qwen2.5:7b": 7.0,
    "qwen2.5:14b": 14.0,
    "qwen2.5:32b": 32.0,
    "qwen3:8b": 8.0,
    "qwen3:14b": 14.0,
    "qwen3:32b": 32.0,
    "qwen3-coder:14b": 14.0,
    "deepseek-r1:7b": 7.0,
    "deepseek-r1:14b": 14.0,
    "deepseek-r1:32b": 32.0,
    "mistral:7b": 7.0,
    "phi4:14b": 14.0,
    "gemma3:4b": 4.0,
    "gemma3:12b": 12.0,
    "llama4:8b": 8.0,
    "llama4-scout:8b": 8.0,
}

# RTX 5070 Ti memory bandwidth (GB/s) — used for tokens/sec estimate
_GPU_BANDWIDTH_GBS = 960.0


def _params_from_name(model_id: str) -> float | None:
    """Extract parameter count (B) from model id, e.g. 'qwen2.5:14b' → 14.0."""
    key = model_id.lower()
    if key in _KNOWN_PARAMS_B:
        return _KNOWN_PARAMS_B[key]
    for sep in (":", "-", "_"):
        for part in reversed(key.split(sep)):
            if part.endswith("b"):
                try:
                    return float(part[:-1])
                except ValueError:
                    pass
    return None


def vram_required_gb(params_b: float, quant_bits: int = 4, context_k: int = 32) -> float:
    """Estimate VRAM in GB: (params × quant_factor) + kv_cache + overhead.

    Formula from spec:
      quant_factor: 0.7 for 4-bit, 1.2 for 8-bit
      kv_cache: 1.5 GB per 32k context
      overhead: 0.8 GB
    """
    quant_factor = 0.7 if quant_bits == 4 else 1.2
    kv_cache = 1.5 * (context_k / 32)
    return round(params_b * quant_factor + kv_cache + 0.8, 1)


def tokens_per_sec_estimate(params_b: float, quant_bits: int = 4) -> int:
    """Rough tokens/sec from GPU memory-bandwidth model at 85% efficiency."""
    bytes_per_param = 0.5 if quant_bits == 4 else 1.0
    model_gb = params_b * bytes_per_param
    if model_gb <= 0:
        return 0
    return int((_GPU_BANDWIDTH_GBS / model_gb) * 0.85)


def daily_electricity_cost_nzd(params_b: float, daily_tokens: int = 50_000) -> float:
    """Estimate daily electricity cost in NZD for local inference."""
    settings = get_settings()
    tps = max(10, tokens_per_sec_estimate(params_b))
    # Scale GPU wattage by model size (assume full load at 20B+)
    watts = settings.GPU_INFERENCE_WATTS * min(1.0, params_b / 20.0)
    hours_per_day = (daily_tokens / tps) / 3600
    kwh = watts * hours_per_day / 1000
    return round(kwh * settings.ELECTRICITY_RATE_KWH, 4)


def _format_cost(prompt_rate_per_token: float, completion_rate_per_token: float) -> str:
    """Format as '$X.XX / $X.XX per 1M tokens'."""
    def fmt(r: float) -> str:
        m = r * 1_000_000
        if m == 0:
            return "$0.00"
        return f"${m:.4f}" if m < 0.01 else f"${m:.2f}"
    return f"{fmt(prompt_rate_per_token)} / {fmt(completion_rate_per_token)}"


# ── OpenRouter cache ─────────────────────────────────────────────────────────

_or_cache: dict[str, dict] = {}
_or_fetched_at: float = 0.0


async def _fetch_openrouter() -> dict[str, dict]:
    global _or_cache, _or_fetched_at
    now = time.monotonic()
    if _or_cache and now - _or_fetched_at < CACHE_TTL:
        return _or_cache
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(f"{OPENROUTER_BASE}/models")
            resp.raise_for_status()
            models = resp.json().get("data", [])
        _or_cache = {m["id"]: m for m in models}
        _or_fetched_at = now
        logger.info("Model picker: OpenRouter refreshed (%d models)", len(_or_cache))
    except Exception:
        logger.warning("Model picker: OpenRouter fetch failed", exc_info=True)
    return _or_cache


# ── Artificial Analysis cache (optional) ────────────────────────────────────

_aa_cache: dict[str, dict] = {}
_aa_fetched_at: float = 0.0


async def _fetch_aa() -> dict[str, dict]:
    global _aa_cache, _aa_fetched_at
    settings = get_settings()
    if not settings.ARTIFICIAL_ANALYSIS_API_KEY:
        return {}
    now = time.monotonic()
    if _aa_cache and now - _aa_fetched_at < CACHE_TTL:
        return _aa_cache
    try:
        headers = {"Authorization": f"Bearer {settings.ARTIFICIAL_ANALYSIS_API_KEY}"}
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                "https://api.artificialanalysis.ai/v1/models",
                headers=headers,
            )
            resp.raise_for_status()
            models = resp.json().get("data", [])
        _aa_cache = {m.get("id", m.get("name", "")): m for m in models}
        _aa_fetched_at = now
        logger.info("Model picker: Artificial Analysis refreshed (%d models)", len(_aa_cache))
    except Exception:
        logger.warning("Model picker: Artificial Analysis fetch failed", exc_info=True)
    return _aa_cache


# ── Ollama loaded models ─────────────────────────────────────────────────────

async def _get_ollama_loaded() -> set[str]:
    """Get loaded models by asking the backend's internal models endpoint."""
    try:
        headers = _make_internal_headers()
        async with get_backend_client() as client:
            resp = await client.get("/internal/inference/models", headers=headers, timeout=3.0)
            if resp.status_code == 200:
                models = resp.json().get("data", [])
                return {m["id"] for m in models if m.get("loaded") and m.get("owned_by") == "local"}
    except Exception:
        pass
    return set()


# ── Intent definitions ───────────────────────────────────────────────────────
# Cloud candidates: (openrouter_id, display_name, provider) in priority order.
# Local candidates: (ollama_id, display_name) in priority order.

_INTENTS: list[dict] = [
    {
        "id": "research",
        "label": "Deep Research / Agentic",
        "tags": {
            "difficulty": "Brain-melting (Logic, Math)",
            "latency_pref": "Wait for 'Thinking Mode'",
        },
        "benchmark": "gpqa_diamond",
        "cloud_candidates": [
            ("anthropic/claude-opus-4", "Claude Opus 4", "Anthropic"),
            ("anthropic/claude-3.7-sonnet:thinking", "Claude 3.7 Sonnet (Thinking)", "Anthropic"),
            ("openai/o3", "GPT-o3", "OpenAI"),
            ("openai/o4-mini", "GPT-o4 Mini", "OpenAI"),
            ("anthropic/claude-sonnet-4-5", "Claude 4.6 Sonnet", "Anthropic"),
        ],
        "cloud_why": "Best reasoning model available. Extended thinking mode for GPQA-Diamond-level research and complex multi-step problems.",
        "local_candidates": [
            ("deepseek-r1:14b", "DeepSeek R1 14B"),
            ("deepseek-r1:7b", "DeepSeek R1 7B"),
            ("qwen3:14b", "Qwen3 14B"),
            ("qwen2.5:14b", "Qwen 2.5 14B"),
        ],
        "local_why": "Open-weight chain-of-thought reasoning model. Shows its thinking before answering. Fits in 16 GB VRAM at Q4.",
    },
    {
        "id": "coding",
        "label": "Professional Coding / Debugging",
        "tags": {
            "difficulty": "High (multi-file refactors)",
            "latency_pref": "High Quality over Speed",
        },
        "benchmark": "swe_bench",
        "cloud_candidates": [
            ("anthropic/claude-sonnet-4-5", "Claude 4.6 Sonnet", "Anthropic"),
            ("anthropic/claude-opus-4", "Claude Opus 4", "Anthropic"),
            ("openai/gpt-4.1", "GPT-4.1", "OpenAI"),
            ("openai/gpt-4o", "GPT-4o", "OpenAI"),
        ],
        "cloud_why": "Leads the SWE-bench leaderboard. Best for autonomous coding agents, multi-file refactors, and complex debugging.",
        "local_candidates": [
            ("qwen3-coder:14b", "Qwen3-Coder 14B"),
            ("qwen2.5:14b", "Qwen 2.5 14B"),
            ("qwen3:14b", "Qwen3 14B"),
            ("deepseek-r1:14b", "DeepSeek R1 14B"),
        ],
        "local_why": "Purpose-built coding model. Comparable to Claude 3.5 for most tasks — at $0/mo with full privacy.",
    },
    {
        "id": "chat",
        "label": "Fast Casual Chat",
        "tags": {
            "difficulty": "Low (Q&A, Summaries)",
            "latency_pref": "Instant (Blink of an eye)",
        },
        "benchmark": "lmsys_elo",
        "cloud_candidates": [
            ("google/gemini-2.0-flash-lite-001", "Gemini 2.0 Flash-Lite", "Google"),
            ("google/gemini-flash-1.5-8b", "Gemini Flash 1.5 8B", "Google"),
            ("openai/gpt-4o-mini", "GPT-4o Mini", "OpenAI"),
            ("anthropic/claude-haiku-4-5", "Claude Haiku 4.5", "Anthropic"),
        ],
        "cloud_why": "Fastest time-to-first-token in its class. Ideal for quick Q&A, summarisation, translation, and casual chat.",
        "local_candidates": [
            ("llama3.2:3b", "Llama 3.2 3B"),
            ("llama3.2:8b", "Llama 3.2 8B"),
            ("llama3.1:8b", "Llama 3.1 8B"),
            ("qwen2.5:7b", "Qwen 2.5 7B"),
            ("gemma3:4b", "Gemma 3 4B"),
            ("gemma3:12b", "Gemma 3 12B"),
        ],
        "local_why": "Tiny model that runs at 200+ tokens/sec on your GPU — faster response than most cloud round-trips.",
    },
]


def _build_cloud_rec(intent: dict, or_models: dict, aa_data: dict) -> dict:
    """Return the best cloud recommendation for an intent (first live candidate)."""
    for model_id, model_name, provider in intent["cloud_candidates"]:
        or_data = or_models.get(model_id, {})
        pricing = or_data.get("pricing", {})
        prompt_rate = float(pricing.get("prompt", "0"))
        completion_rate = float(pricing.get("completion", "0"))

        # Benchmark score from Artificial Analysis (optional)
        benchmark_score: float | None = None
        aa_entry = aa_data.get(model_id) or aa_data.get(model_name)
        if aa_entry:
            benchmark_score = (
                aa_entry.get(intent["benchmark"])
                or aa_entry.get("intelligence_index")
            )

        return {
            "type": "cloud",
            "id": model_id,
            "name": or_data.get("name", model_name),
            "provider": provider,
            "cost_per_1m": _format_cost(prompt_rate, completion_rate),
            "cost_per_1m_input_usd": round(prompt_rate * 1_000_000, 4),
            "cost_per_1m_output_usd": round(completion_rate * 1_000_000, 4),
            "context_length": or_data.get("context_length"),
            "benchmark_score": benchmark_score,
            "benchmark_label": intent["benchmark"].replace("_", " ").upper(),
            "in_catalog": model_id in or_models,
            "why": intent["cloud_why"],
        }

    # Unreachable but satisfy type checker
    return {}  # pragma: no cover


def _build_local_rec(intent: dict, ollama_loaded: set[str], vram_gb: float) -> dict | None:
    """Return the best local model that fits in VRAM, preferring loaded ones."""
    best_loaded: dict | None = None
    best_fits: dict | None = None

    for model_id, model_name in intent["local_candidates"]:
        params_b = _params_from_name(model_id)
        if params_b is None:
            continue
        vram_req = vram_required_gb(params_b)
        if vram_req > vram_gb:
            continue  # doesn't fit

        tps = tokens_per_sec_estimate(params_b)
        vram_spare = round(vram_gb - vram_req, 1)
        daily_cost = daily_electricity_cost_nzd(params_b)
        is_loaded = model_id in ollama_loaded

        entry = {
            "type": "local",
            "id": model_id,
            "name": model_name,
            "provider": "Local (Ollama)",
            "cost_per_1m": "$0.00",
            "vram_required_gb": vram_req,
            "vram_spare_gb": vram_spare,
            "params_b": params_b,
            "tokens_per_sec": tps,
            "daily_electricity_cost": daily_cost,
            "available": is_loaded,
            "why": intent["local_why"],
        }

        if is_loaded and best_loaded is None:
            best_loaded = entry
        if best_fits is None:
            best_fits = entry

    return best_loaded or best_fits


# ── Endpoint ─────────────────────────────────────────────────────────────────

@router.get("/recommendations")
async def get_recommendations():
    """Return live model recommendations for all three intents.

    Fetches pricing from OpenRouter and benchmark data from Artificial
    Analysis (if ARTIFICIAL_ANALYSIS_API_KEY is set), both cached for 6 hours.
    Checks which local models are currently loaded in Ollama.
    No authentication required — safe to call before login.
    """
    settings = get_settings()
    vram_gb = settings.GPU_VRAM_GB

    or_models, aa_data, ollama_loaded = await asyncio.gather(
        _fetch_openrouter(),
        _fetch_aa(),
        _get_ollama_loaded(),
    )

    intents = []
    for intent in _INTENTS:
        cloud = _build_cloud_rec(intent, or_models, aa_data)
        local = _build_local_rec(intent, ollama_loaded, vram_gb)
        intents.append({
            "id": intent["id"],
            "label": intent["label"],
            "tags": intent["tags"],
            "cloud": cloud,
            "local": local,
        })

    cache_age = int(time.monotonic() - _or_fetched_at) if _or_fetched_at > 0 else None
    has_aa = bool(settings.ARTIFICIAL_ANALYSIS_API_KEY)

    return {
        "intents": intents,
        "gpu_vram_gb": vram_gb,
        "data_source": "live" if _or_cache else "static",
        "cache_age_seconds": cache_age,
        "benchmarks_enabled": has_aa,
    }
