"""OpenAI-compatible inference endpoints."""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from collections.abc import AsyncGenerator
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.lib.billing import (
    calculate_inference_cost,
    check_balance_ok,
    get_inference_cost_per_token,
    write_ledger_entry,
)
from app.lib.ollama import chat_completion as ollama_chat, chat_completion_stream as ollama_stream, count_tokens, list_models as ollama_list_models, list_running_models as ollama_list_running_models
from app.lib.openrouter import (
    chat_completion as openrouter_chat,
    chat_completion_stream as openrouter_stream,
    is_openrouter_model,
    list_models as openrouter_list_models,
)
from app.lib.inference_queue import QueueEntry, gpu_queue
from app.models import UsageLog, User
from app.routers.auth import get_current_user
from app.schemas.inference import (
    ChatCompletionChoice,
    ChatCompletionRequest,
    ChatCompletionResponse,
    ChatMessage,
    ModelInfo,
    ModelsResponse,
    UsageInfo,
)

router = APIRouter(prefix="/v1/inference", tags=["inference"])


def _extract_text(content: str | list) -> str:
    """Extract plain text from a message content (str or list of ContentParts)."""
    if isinstance(content, str):
        return content
    from app.schemas.inference import ContentPart
    return " ".join(p.text for p in content if isinstance(p, ContentPart) and p.type == "text" and p.text)


def _to_ollama_message(m) -> dict:
    """Convert a ChatMessage to Ollama API format (images array for vision)."""
    if isinstance(m.content, str):
        return {"role": m.role, "content": m.content}
    from app.schemas.inference import ContentPart
    text_parts = [p.text for p in m.content if isinstance(p, ContentPart) and p.type == "text" and p.text]
    images = []
    for p in m.content:
        if isinstance(p, ContentPart) and p.type == "image_url" and p.image_url:
            url = p.image_url.get("url", "")
            if "," in url:
                images.append(url.split(",", 1)[1])
    msg: dict = {"role": m.role, "content": " ".join(text_parts)}
    if images:
        msg["images"] = images
    return msg


def _to_openrouter_message(m) -> dict:
    """Convert a ChatMessage to OpenRouter/OpenAI API format (content parts)."""
    if isinstance(m.content, str):
        return {"role": m.role, "content": m.content}
    return {"role": m.role, "content": [p.model_dump(exclude_none=True) for p in m.content]}


# ---------------------------------------------------------------------------
# Auto-model routing
# ---------------------------------------------------------------------------

AUTO_TOKEN_THRESHOLD = 2000


async def _resolve_auto_model(input_tokens: int) -> tuple[str, bool]:
    """Pick a real model when the user requests 'auto'.

    Returns (model_name, use_openrouter).
    Small prompts (< threshold) → lightest local model.
    Large prompts (>= threshold) → heaviest local model or first OpenRouter model.
    """
    settings = get_settings()

    try:
        local_models = await ollama_list_models()
    except Exception:
        local_models = []

    or_models: list[dict] = []
    if settings.OPENROUTER_API_KEY:
        try:
            or_models = await openrouter_list_models()
        except Exception:
            pass

    if input_tokens < AUTO_TOKEN_THRESHOLD:
        # Light: prefer first (smallest) local model
        if local_models:
            return local_models[0], False
        if or_models:
            return or_models[0]["id"], True
    else:
        # Heavy: prefer OpenRouter if available, else largest local model
        if or_models:
            return or_models[0]["id"], True
        if local_models:
            return local_models[-1], False

    # Fallback
    if local_models:
        return local_models[0], False
    raise HTTPException(status_code=503, detail="No models available for auto routing")


# ---------------------------------------------------------------------------
# POST /chat/completions
# ---------------------------------------------------------------------------


@router.post("/chat/completions")
async def create_chat_completion(
    body: ChatCompletionRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """OpenAI-compatible chat completion (streaming and non-streaming)."""
    settings = get_settings()

    # Check billing if enabled
    if settings.BILLING_ENABLED:
        if not await check_balance_ok(db, user.id, user.hard_limit_nzd):
            raise HTTPException(
                status_code=402,
                detail="Insufficient balance. Please top up your account.",
            )

    # Count input tokens (text parts only)
    input_text = " ".join(_extract_text(m.content) for m in body.messages)
    input_tokens = count_tokens(input_text)

    # Resolve "auto" to a real model
    if body.model == "auto":
        resolved_model, _ = await _resolve_auto_model(input_tokens)
        body = body.model_copy(update={"model": resolved_model})

    use_openrouter = is_openrouter_model(body.model) and settings.OPENROUTER_API_KEY
    if use_openrouter:
        messages = [_to_openrouter_message(m) for m in body.messages]
    else:
        messages = [_to_ollama_message(m) for m in body.messages]

    if body.stream:
        return StreamingResponse(
            _stream_response(
                model=body.model,
                messages=messages,
                input_tokens=input_tokens,
                temperature=body.temperature,
                max_tokens=body.max_tokens,
                user=user,
                db=db,
                use_openrouter=bool(use_openrouter),
                queue_entry=None if use_openrouter else QueueEntry(),
            ),
            media_type="text/event-stream",
        )

    # Non-streaming path
    if use_openrouter:
        result = await openrouter_chat(
            model=body.model, messages=messages,
            temperature=body.temperature, max_tokens=body.max_tokens,
        )
        assistant_content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        # OpenRouter returns usage in the response
        usage = result.get("usage", {})
        output_tokens = usage.get("completion_tokens", count_tokens(assistant_content))
        input_tokens = usage.get("prompt_tokens", input_tokens)
    else:
        entry = QueueEntry()
        await gpu_queue.acquire(entry)
        try:
            result = await ollama_chat(
                model=body.model, messages=messages,
                temperature=body.temperature, max_tokens=body.max_tokens,
            )
        finally:
            gpu_queue.release(entry)
        assistant_content = result.get("message", {}).get("content", "")
        output_tokens = count_tokens(assistant_content)

    # Calculate cost and record usage
    cost, kwh = await _calculate_cost(body.model, input_tokens, output_tokens, use_openrouter=bool(use_openrouter))

    usage_log = UsageLog(
        user_id=user.id,
        model=body.model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_nzd=cost,
        kwh=kwh,
    )
    db.add(usage_log)

    if settings.BILLING_ENABLED:
        await write_ledger_entry(
            db=db,
            user_id=user.id,
            amount=-cost,
            entry_type="inference_usage",
            description=f"Inference: {body.model} ({input_tokens}+{output_tokens} tokens)",
        )

    completion_id = f"chatcmpl-{uuid.uuid4().hex[:24]}"
    created = int(time.time())

    return ChatCompletionResponse(
        id=completion_id,
        created=created,
        model=body.model,
        choices=[
            ChatCompletionChoice(
                index=0,
                message=ChatMessage(role="assistant", content=assistant_content),
                finish_reason="stop",
            )
        ],
        usage=UsageInfo(
            prompt_tokens=input_tokens,
            completion_tokens=output_tokens,
            total_tokens=input_tokens + output_tokens,
        ),
    )


async def _calculate_cost(
    model: str, input_tokens: int, output_tokens: int, use_openrouter: bool = False
) -> tuple[Decimal, Decimal]:
    """Calculate cost. For OpenRouter, use their pricing. For local, use electricity."""
    if use_openrouter:
        # OpenRouter pricing is per-token. Fetches from API on cache miss
        # so we never silently bill at $0.
        # We store kwh=0 for cloud models since no local energy is used.
        from app.lib.openrouter import _get_model_pricing
        prompt_rate, completion_rate = await _get_model_pricing(model)
        cost = (Decimal(str(prompt_rate)) * input_tokens) + (Decimal(str(completion_rate)) * output_tokens)
        return cost, Decimal("0")
    else:
        from app.lib.billing import calculate_inference_cost
        return calculate_inference_cost(input_tokens, output_tokens)


async def _stream_response(
    model: str,
    messages: list[dict],
    input_tokens: int,
    temperature: float | None,
    max_tokens: int | None,
    user: User,
    db: AsyncSession,
    use_openrouter: bool = False,
    queue_entry: QueueEntry | None = None,
) -> AsyncGenerator[str, None]:
    """Generate SSE chunks for a streaming chat completion."""
    settings = get_settings()
    completion_id = f"chatcmpl-{uuid.uuid4().hex[:24]}"
    created = int(time.time())
    collected_content = ""
    # OpenRouter may report accurate token counts in the final streaming chunk
    or_prompt_tokens: int | None = None
    or_completion_tokens: int | None = None

    try:
        # --- Queue wait (local models only) ---
        if queue_entry is not None:
            gpu_queue._waiters.append(queue_entry)
            if gpu_queue._waiters[0] is queue_entry:
                queue_entry.event.set()

            while not queue_entry.event.is_set():
                pos = gpu_queue.position(queue_entry)
                yield f"data: {json.dumps({'queue_position': pos})}\n\n"
                try:
                    await asyncio.wait_for(
                        asyncio.shield(queue_entry.event.wait()),
                        timeout=2.0,
                    )
                except asyncio.TimeoutError:
                    pass

            # Signal that we're now running
            yield f"data: {json.dumps({'queue_position': 0})}\n\n"

        # --- Stream the completion ---
        stream_fn = openrouter_stream if use_openrouter else ollama_stream

        try:
            async for chunk in stream_fn(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            ):
                if use_openrouter:
                    # Capture usage from the final chunk (sent when stream_options.include_usage is set)
                    usage = chunk.get("usage")
                    if usage:
                        or_prompt_tokens = usage.get("prompt_tokens")
                        or_completion_tokens = usage.get("completion_tokens")
                    content = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                    done = chunk.get("choices", [{}])[0].get("finish_reason") is not None
                else:
                    content = chunk.get("message", {}).get("content", "")
                    done = chunk.get("done", False)

                if content:
                    collected_content += content

                finish_reason = "stop" if done else None

                sse_chunk = {
                    "id": completion_id,
                    "object": "chat.completion.chunk",
                    "created": created,
                    "model": model,
                    "choices": [
                        {
                            "index": 0,
                            "delta": {"content": content} if content else {},
                            "finish_reason": finish_reason,
                        }
                    ],
                }

                yield f"data: {json.dumps(sse_chunk)}\n\n"
        except Exception as exc:
            # Send error as an SSE event so the client gets a message instead of a broken stream
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"
            yield "data: [DONE]\n\n"
            return

        # --- Record usage ---
        # Prefer OpenRouter's reported token counts over local tiktoken estimates
        if use_openrouter and or_prompt_tokens is not None:
            input_tokens = or_prompt_tokens
        if use_openrouter and or_completion_tokens is not None:
            output_tokens = or_completion_tokens
        else:
            output_tokens = count_tokens(collected_content)
        cost, kwh = await _calculate_cost(model, input_tokens, output_tokens, use_openrouter=use_openrouter)

        usage_log = UsageLog(
            user_id=user.id,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_nzd=cost,
            kwh=kwh,
        )
        db.add(usage_log)

        if settings.BILLING_ENABLED:
            await write_ledger_entry(
                db=db,
                user_id=user.id,
                amount=-cost,
                entry_type="inference_usage",
                description=f"Inference: {model} ({input_tokens}+{output_tokens} tokens)",
            )
        await db.commit()

        yield "data: [DONE]\n\n"
    finally:
        if queue_entry is not None:
            gpu_queue.release(queue_entry)


# ---------------------------------------------------------------------------
# GET /models
# ---------------------------------------------------------------------------


@router.get("/models", response_model=ModelsResponse)
async def list_models(
    user: User = Depends(get_current_user),
):
    """Return only models that are actually available (local + OpenRouter)."""
    settings = get_settings()
    models: list[ModelInfo] = []

    # Virtual "auto" model — smart routing (always first)
    models.append(ModelInfo(
        id="auto",
        owned_by="gpushare",
        cost_per_million_tokens=0,
        loaded=True,
        vision_support=False,
    ))

    # Local Ollama models — only those actually loaded
    try:
        available = await ollama_list_models()
    except Exception:
        available = []

    # Which models are currently in VRAM (fast to infer)
    try:
        running = set(await ollama_list_running_models())
    except Exception:
        running = set()

    _VISION_NAME_PATTERNS = ("llava", "moondream", "bakllava", "vision", "minicpm-v", "qwen2-vl", "llama3.2-vision")

    local_cost = get_inference_cost_per_token()
    for model_name in available:
        name_lower = model_name.lower()
        is_vision = any(p in name_lower for p in _VISION_NAME_PATTERNS)
        models.append(ModelInfo(
            id=model_name,
            owned_by="local",
            cost_per_million_tokens=float(local_cost * Decimal("1000000")) if settings.BILLING_ENABLED else 0,
            loaded=model_name in running,
            vision_support=is_vision,
        ))

    # OpenRouter models
    if settings.OPENROUTER_API_KEY:
        try:
            or_models = await openrouter_list_models()
            for m in or_models:
                pricing = m.get("pricing", {})
                # OpenRouter pricing is per-token as a string
                prompt_rate = float(pricing.get("prompt", "0"))
                completion_rate = float(pricing.get("completion", "0"))
                # Blended display rate: 3/4 input + 1/4 output (typical usage skews heavily toward input)
                avg_rate = (3 * prompt_rate + completion_rate) / 4
                # OpenRouter models support vision if the model architecture includes image input
                architecture = m.get("architecture", {})
                input_modalities = architecture.get("input_modalities") or architecture.get("modality", "")
                is_vision = "image" in str(input_modalities).lower()
                models.append(ModelInfo(
                    id=m["id"],
                    owned_by="openrouter",
                    cost_per_million_tokens=round(avg_rate * 1_000_000, 4),
                    vision_support=is_vision,
                ))
        except Exception:
            pass

    return ModelsResponse(data=models)
