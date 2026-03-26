"""Internal health and status endpoints — called by middleware, not exposed publicly."""

from __future__ import annotations

import subprocess
from typing import Optional

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.lib.gpu_detect import detect_gpu
from app.models import RenderJob

router = APIRouter(prefix="/internal", tags=["internal"])


# ---------------------------------------------------------------------------
# GET /internal/health
# ---------------------------------------------------------------------------


@router.get("/health")
async def internal_health():
    """Return full health JSON including Ollama, Tapo, GPU, and integration flags."""
    settings = get_settings()

    # Check Ollama
    ollama_status = "offline"
    ollama_models: list[str] = []
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{settings.OLLAMA_HOST}/api/tags")
            if resp.status_code == 200:
                data = resp.json()
                loaded = data.get("models", [])
                ollama_models = [m["name"] for m in loaded]
                ollama_status = "ready" if loaded else "warming_up"
    except Exception:
        ollama_status = "offline"

    # Check configured integrations
    from app.lib.tapo import is_configured as tapo_configured, get_energy_summary

    integrations = {
        "stripe": bool(
            settings.STRIPE_SECRET_KEY
            and settings.STRIPE_SECRET_KEY != "sk_test_placeholder"
        ),
        "r2": bool(
            settings.CLOUDFLARE_R2_ACCOUNT_ID
            and settings.CLOUDFLARE_R2_ACCOUNT_ID != "placeholder"
        ),
        "resend": bool(
            settings.RESEND_API_KEY and settings.RESEND_API_KEY != "re_placeholder"
        ),
        "billing": settings.BILLING_ENABLED,
        "openrouter": bool(settings.OPENROUTER_API_KEY),
        "tapo": tapo_configured(),
    }

    # Fetch live power data from Tapo smart plug
    power = None
    if integrations["tapo"]:
        summary = await get_energy_summary()
        if summary:
            power = {
                "current_watts": summary.current_watts,
                "today_kwh": summary.today_kwh,
                "month_kwh": summary.month_kwh,
                "today_cost": summary.today_cost,
                "month_cost": summary.month_cost,
                "currency": settings.CURRENCY,
                "rate_per_kwh": settings.ELECTRICITY_RATE_KWH,
            }

    return {
        "status": "ok",
        "node": settings.NODE_NAME,
        "services": settings.services_list,
        "ollama": ollama_status,
        "ollama_models": ollama_models,
        "integrations": integrations,
        "power": power,
        "gpu_detected": detect_gpu().to_dict(),
    }


# ---------------------------------------------------------------------------
# GET /internal/status
# ---------------------------------------------------------------------------


class GpuInfo(BaseModel):
    name: str
    vram_total_mb: int
    vram_used_mb: int
    utilization_pct: int


class StatusResponse(BaseModel):
    status: str
    gpu: Optional[GpuInfo] = None
    models_loaded: list[str] = []
    queue_depth: int = 0
    estimated_wait_seconds: int = 0
    electricity_rate_nzd_kwh: float = 0.0


def _get_gpu_info() -> GpuInfo | None:
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=name,memory.total,memory.used,utilization.gpu",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode != 0:
            return None
        line = result.stdout.strip().split("\n")[0]
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 4:
            return None
        return GpuInfo(
            name=parts[0],
            vram_total_mb=int(float(parts[1])),
            vram_used_mb=int(float(parts[2])),
            utilization_pct=int(float(parts[3])),
        )
    except (FileNotFoundError, subprocess.TimeoutExpired, Exception):
        return None


@router.get("/status", response_model=StatusResponse)
async def internal_status(db: AsyncSession = Depends(get_db)):
    """Return GPU availability, loaded models, and queue depth."""
    settings = get_settings()

    gpu = _get_gpu_info()

    from app.lib.ollama import list_models as ollama_list_models

    models_loaded: list[str] = []
    ollama_reachable = False
    try:
        models_loaded = await ollama_list_models()
        ollama_reachable = True
    except Exception:
        pass

    queue_result = await db.execute(
        select(func.count()).select_from(RenderJob).where(RenderJob.status == "queued")
    )
    queue_depth = queue_result.scalar_one()

    if not ollama_reachable and gpu is None:
        overall_status = "offline"
    elif gpu and gpu.utilization_pct > 90:
        overall_status = "busy"
    elif queue_depth > 0:
        overall_status = "busy"
    else:
        overall_status = "available"

    estimated_wait = queue_depth * 30 if queue_depth > 0 else 0

    return StatusResponse(
        status=overall_status,
        gpu=gpu,
        models_loaded=models_loaded,
        queue_depth=queue_depth,
        estimated_wait_seconds=estimated_wait,
        electricity_rate_nzd_kwh=settings.ELECTRICITY_RATE_KWH,
    )


# ---------------------------------------------------------------------------
# GET /internal/ping
# ---------------------------------------------------------------------------


@router.get("/ping")
async def ping():
    """Simple liveness check for Docker healthcheck."""
    return {"ok": True}


# ---------------------------------------------------------------------------
# GET /internal/admin/health/{integration_key}
# ---------------------------------------------------------------------------


@router.get("/admin/health/{integration_key}")
async def check_integration_health(integration_key: str):
    """Test connectivity for a specific integration."""
    settings = get_settings()

    checks = {
        "ollama": _check_ollama,
        "stripe": _check_stripe,
        "r2": _check_r2,
        "resend": _check_resend,
        "openrouter": _check_openrouter,
        "tapo": _check_tapo,
    }

    check_fn = checks.get(integration_key)
    if not check_fn:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Unknown integration")

    try:
        await check_fn(settings)
        return {"status": "ok", "integration": integration_key}
    except Exception as e:
        return {"status": "error", "integration": integration_key, "detail": str(e)}


async def _check_ollama(settings):
    async with httpx.AsyncClient(timeout=5) as client:
        r = await client.get(f"{settings.OLLAMA_HOST}/api/tags")
        r.raise_for_status()


async def _check_stripe(settings):
    import stripe as stripe_lib

    stripe_lib.api_key = settings.STRIPE_SECRET_KEY
    stripe_lib.Account.retrieve()


async def _check_r2(settings):
    import boto3

    s3 = boto3.client(
        "s3",
        endpoint_url=f"https://{settings.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.CLOUDFLARE_R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    )
    s3.head_bucket(Bucket=settings.CLOUDFLARE_R2_BUCKET)


async def _check_resend(settings):
    async with httpx.AsyncClient(timeout=5) as client:
        r = await client.get(
            "https://api.resend.com/domains",
            headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
        )
        r.raise_for_status()


async def _check_openrouter(settings):
    async with httpx.AsyncClient(timeout=5) as client:
        r = await client.get(
            "https://openrouter.ai/api/v1/models",
            headers={"Authorization": f"Bearer {settings.OPENROUTER_API_KEY}"},
        )
        r.raise_for_status()


async def _check_tapo(settings):
    async with httpx.AsyncClient(timeout=5) as client:
        r = await client.get(f"http://{settings.TAPO_DEVICE_IP}/api/v1/status", timeout=3)
        r.raise_for_status()
