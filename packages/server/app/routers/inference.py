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
from app.lib.ollama import chat_completion as ollama_chat, chat_completion_stream as ollama_stream, count_tokens, list_models as ollama_list_models
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

    # Count input tokens
    input_text = " ".join(m.content for m in body.messages)
    input_tokens = count_tokens(input_text)

    messages = [{"role": m.role, "content": m.content} for m in body.messages]
    use_openrouter = is_openrouter_model(body.model) and settings.OPENROUTER_API_KEY

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
    cost, kwh = _calculate_cost(body.model, input_tokens, output_tokens, use_openrouter=bool(use_openrouter))

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


def _calculate_cost(
    model: str, input_tokens: int, output_tokens: int, use_openrouter: bool = False
) -> tuple[Decimal, Decimal]:
    """Calculate cost. For OpenRouter, use their pricing. For local, use electricity."""
    if use_openrouter:
        # OpenRouter pricing is per-token, fetched at model list time
        # For now, use a cached lookup. Cost is passed through at OpenRouter's rate.
        # We store kwh=0 for cloud models since no local energy is used.
        from app.lib.openrouter import _get_model_pricing
        prompt_rate, completion_rate = _get_model_pricing(model)
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

        async for chunk in stream_fn(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        ):
            if use_openrouter:
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

        # --- Record usage ---
        output_tokens = count_tokens(collected_content)
        cost, kwh = _calculate_cost(model, input_tokens, output_tokens, use_openrouter=use_openrouter)

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

    # Local Ollama models — only those actually loaded
    try:
        available = await ollama_list_models()
    except Exception:
        available = []

    local_cost = get_inference_cost_per_token()
    for model_name in available:
        models.append(ModelInfo(
            id=model_name,
            owned_by="local",
            cost_per_million_tokens=float(local_cost * Decimal("1000000")) if settings.BILLING_ENABLED else 0,
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
                # Average the two rates and multiply by 1M for display
                avg_rate = (prompt_rate + completion_rate) / 2
                models.append(ModelInfo(
                    id=m["id"],
                    owned_by="openrouter",
                    cost_per_million_tokens=round(avg_rate * 1_000_000, 4),
                ))
        except Exception:
            pass

    return ModelsResponse(data=models)
