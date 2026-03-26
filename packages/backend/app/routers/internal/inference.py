"""Internal inference endpoints — accepts X-User-Id header instead of JWT auth."""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from collections.abc import AsyncGenerator
from decimal import Decimal

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.lib.billing import (
    calculate_inference_cost,
    check_balance_ok,
    get_inference_cost_per_token,
    write_ledger_entry,
)
from app.lib.ollama import (
    chat_completion as ollama_chat,
    chat_completion_stream as ollama_stream,
    count_tokens,
    list_models as ollama_list_models,
    list_running_models as ollama_list_running_models,
)
from app.lib.openrouter import (
    chat_completion as openrouter_chat,
    chat_completion_stream as openrouter_stream,
    is_openrouter_model,
    list_models as openrouter_list_models,
)
from app.lib.inference_queue import QueueEntry, gpu_queue
from app.models import UsageLog, User
from app.schemas.inference import (
    ChatCompletionChoice,
    ChatCompletionRequest,
    ChatCompletionResponse,
    ChatMessage,
    ModelInfo,
    ModelsResponse,
    UsageInfo,
)

router = APIRouter(prefix="/internal/inference", tags=["internal"])


def _extract_text(content: str | list) -> str:
    if isinstance(content, str):
        return content
    from app.schemas.inference import ContentPart

    return " ".join(
        p.text
        for p in content
        if isinstance(p, ContentPart) and p.type == "text" and p.text
    )


def _to_ollama_message(m) -> dict:
    msg: dict = {"role": m.role}
    if isinstance(m.content, str):
        msg["content"] = m.content
    elif m.content is not None:
        from app.schemas.inference import ContentPart

        text_parts = [
            p.text
            for p in m.content
            if isinstance(p, ContentPart) and p.type == "text" and p.text
        ]
        images = []
        for p in m.content:
            if isinstance(p, ContentPart) and p.type == "image_url" and p.image_url:
                url = p.image_url.get("url", "")
                if "," in url:
                    images.append(url.split(",", 1)[1])
        msg["content"] = " ".join(text_parts)
        if images:
            msg["images"] = images
    else:
        msg["content"] = ""
    if m.tool_calls:
        msg["tool_calls"] = [tc.model_dump() for tc in m.tool_calls]
    if m.tool_call_id:
        msg["tool_call_id"] = m.tool_call_id
    return msg


def _to_openrouter_message(m) -> dict:
    msg: dict = {"role": m.role}
    if isinstance(m.content, str):
        msg["content"] = m.content
    elif m.content is not None:
        msg["content"] = [p.model_dump(exclude_none=True) for p in m.content]
    else:
        msg["content"] = None
    if m.tool_calls:
        msg["tool_calls"] = [tc.model_dump() for tc in m.tool_calls]
    if m.tool_call_id:
        msg["tool_call_id"] = m.tool_call_id
    if m.name:
        msg["name"] = m.name
    return msg


AUTO_TOKEN_THRESHOLD = 2000


async def _resolve_auto_model(input_tokens: int, user: User | None = None) -> tuple[str, bool]:
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

    light_model: str | None = None
    heavy_model: str | None = None
    threshold = AUTO_TOKEN_THRESHOLD

    if user is not None:
        if user.auto_light_model:
            light_model = user.auto_light_model
        if user.auto_heavy_model:
            heavy_model = user.auto_heavy_model
        if user.auto_token_threshold:
            threshold = user.auto_token_threshold

    if input_tokens < threshold:
        if light_model:
            use_or = is_openrouter_model(light_model)
            return light_model, use_or
        if local_models:
            return local_models[0], False
        if or_models:
            return or_models[0]["id"], True
    else:
        if heavy_model:
            use_or = is_openrouter_model(heavy_model)
            return heavy_model, use_or
        if or_models:
            return or_models[0]["id"], True
        if local_models:
            return local_models[-1], False

    if local_models:
        return local_models[0], False
    raise HTTPException(status_code=503, detail="No models available for auto routing")


async def _calculate_cost(
    model: str, input_tokens: int, output_tokens: int, use_openrouter: bool = False
) -> tuple[Decimal, Decimal]:
    if use_openrouter:
        from app.lib.openrouter import _get_model_pricing

        prompt_rate, completion_rate = await _get_model_pricing(model)
        cost = (Decimal(str(prompt_rate)) * input_tokens) + (
            Decimal(str(completion_rate)) * output_tokens
        )
        return cost, Decimal("0")
    else:
        return calculate_inference_cost(input_tokens, output_tokens)


# ---------------------------------------------------------------------------
# POST /internal/inference/chat
# ---------------------------------------------------------------------------


@router.post("/chat")
async def internal_chat(
    body: ChatCompletionRequest,
    x_user_id: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """Handle chat completion — both streaming and non-streaming.

    Accepts X-User-Id header (trusted from middleware) instead of JWT auth.
    """
    settings = get_settings()
    user_id = uuid.UUID(x_user_id)

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    if settings.BILLING_ENABLED:
        if not await check_balance_ok(db, user.id, user.hard_limit_nzd):
            raise HTTPException(
                status_code=402,
                detail="Insufficient balance. Please top up your account.",
            )

    input_text = " ".join(_extract_text(m.content) for m in body.messages)
    input_tokens = count_tokens(input_text)

    if body.model == "auto":
        resolved_model, _ = await _resolve_auto_model(input_tokens, user=user)
        body = body.model_copy(update={"model": resolved_model})

    use_openrouter = is_openrouter_model(body.model) and settings.OPENROUTER_API_KEY

    tools_dicts = [t.model_dump() for t in body.tools] if body.tools else None

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
                tools=tools_dicts,
                tool_choice=body.tool_choice,
            ),
            media_type="text/event-stream",
        )

    if use_openrouter:
        result = await openrouter_chat(
            model=body.model,
            messages=messages,
            temperature=body.temperature,
            max_tokens=body.max_tokens,
            tools=tools_dicts,
            tool_choice=body.tool_choice,
        )
        resp_message = result.get("choices", [{}])[0].get("message", {})
        assistant_content = resp_message.get("content", "")
        resp_tool_calls = resp_message.get("tool_calls")
        resp_finish_reason = result.get("choices", [{}])[0].get("finish_reason", "stop")
        usage = result.get("usage", {})
        output_tokens = usage.get("completion_tokens", count_tokens(assistant_content or ""))
        input_tokens = usage.get("prompt_tokens", input_tokens)
    else:
        entry = QueueEntry()
        await gpu_queue.acquire(entry)
        try:
            result = await ollama_chat(
                model=body.model,
                messages=messages,
                temperature=body.temperature,
                max_tokens=body.max_tokens,
                tools=tools_dicts,
            )
        finally:
            gpu_queue.release(entry)
        resp_message = result.get("message", {})
        assistant_content = resp_message.get("content", "")
        resp_tool_calls = resp_message.get("tool_calls")
        resp_finish_reason = "stop"
        output_tokens = count_tokens(assistant_content or "")

    assistant_msg = ChatMessage(role="assistant", content=assistant_content or None)
    if resp_tool_calls:
        from app.schemas.inference import ToolCall, ToolCallFunction

        parsed_tool_calls = []
        for i, tc in enumerate(resp_tool_calls):
            func = tc.get("function", {})
            args = func.get("arguments", "{}")
            if isinstance(args, dict):
                args = json.dumps(args)
            parsed_tool_calls.append(
                ToolCall(
                    id=tc.get("id", f"call_{uuid.uuid4().hex[:24]}"),
                    type=tc.get("type", "function"),
                    function=ToolCallFunction(
                        name=func.get("name", ""),
                        arguments=args,
                    ),
                )
            )
        assistant_msg.tool_calls = parsed_tool_calls
        resp_finish_reason = "tool_calls"

    cost, kwh = await _calculate_cost(
        body.model, input_tokens, output_tokens, use_openrouter=bool(use_openrouter)
    )

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
            entry_type="cloud_inference_usage" if use_openrouter else "inference_usage",
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
                message=assistant_msg,
                finish_reason=resp_finish_reason,
            )
        ],
        usage=UsageInfo(
            prompt_tokens=input_tokens,
            completion_tokens=output_tokens,
            total_tokens=input_tokens + output_tokens,
        ),
    )


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
    tools: list[dict] | None = None,
    tool_choice: str | dict | None = None,
) -> AsyncGenerator[str, None]:
    settings = get_settings()
    completion_id = f"chatcmpl-{uuid.uuid4().hex[:24]}"
    created = int(time.time())
    collected_content = ""
    or_prompt_tokens: int | None = None
    or_completion_tokens: int | None = None

    try:
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

            yield f"data: {json.dumps({'queue_position': 0})}\n\n"

        stream_fn = openrouter_stream if use_openrouter else ollama_stream

        stream_kwargs: dict = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if tools:
            stream_kwargs["tools"] = tools
        if use_openrouter and tool_choice is not None:
            stream_kwargs["tool_choice"] = tool_choice

        try:
            async for chunk in stream_fn(**stream_kwargs):
                if use_openrouter:
                    usage = chunk.get("usage")
                    if usage:
                        or_prompt_tokens = usage.get("prompt_tokens")
                        or_completion_tokens = usage.get("completion_tokens")
                    delta = chunk.get("choices", [{}])[0].get("delta", {})
                    content = delta.get("content", "")
                    done = chunk.get("choices", [{}])[0].get("finish_reason") is not None
                    finish_reason_raw = chunk.get("choices", [{}])[0].get("finish_reason")
                else:
                    content = chunk.get("message", {}).get("content", "")
                    done = chunk.get("done", False)
                    delta = {}
                    finish_reason_raw = None

                if content:
                    collected_content += content

                finish_reason = finish_reason_raw if done else None

                sse_delta: dict = {}
                if content:
                    sse_delta["content"] = content
                if use_openrouter and "tool_calls" in delta:
                    sse_delta["tool_calls"] = delta["tool_calls"]
                if not use_openrouter and done:
                    msg = chunk.get("message", {})
                    if "tool_calls" in msg and msg["tool_calls"]:
                        tc_list = []
                        for i, tc in enumerate(msg["tool_calls"]):
                            func = tc.get("function", {})
                            args = func.get("arguments", "{}")
                            if isinstance(args, dict):
                                args = json.dumps(args)
                            tc_list.append(
                                {
                                    "index": i,
                                    "id": f"call_{uuid.uuid4().hex[:24]}",
                                    "type": "function",
                                    "function": {
                                        "name": func.get("name", ""),
                                        "arguments": args,
                                    },
                                }
                            )
                        sse_delta["tool_calls"] = tc_list
                        finish_reason = "tool_calls"

                sse_chunk = {
                    "id": completion_id,
                    "object": "chat.completion.chunk",
                    "created": created,
                    "model": model,
                    "choices": [
                        {
                            "index": 0,
                            "delta": sse_delta,
                            "finish_reason": finish_reason,
                        }
                    ],
                }

                yield f"data: {json.dumps(sse_chunk)}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"
            yield "data: [DONE]\n\n"
            return

        if use_openrouter and or_prompt_tokens is not None:
            input_tokens = or_prompt_tokens
        if use_openrouter and or_completion_tokens is not None:
            output_tokens = or_completion_tokens
        else:
            output_tokens = count_tokens(collected_content)
        cost, kwh = await _calculate_cost(
            model, input_tokens, output_tokens, use_openrouter=use_openrouter
        )

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
                entry_type="cloud_inference_usage" if use_openrouter else "inference_usage",
                description=f"Inference: {model} ({input_tokens}+{output_tokens} tokens)",
            )
        await db.commit()

        yield "data: [DONE]\n\n"
    finally:
        if queue_entry is not None:
            gpu_queue.release(queue_entry)


# ---------------------------------------------------------------------------
# GET /internal/inference/models
# ---------------------------------------------------------------------------


@router.get("/models", response_model=ModelsResponse)
async def internal_list_models():
    """Return available models (local + OpenRouter). No user auth needed."""
    settings = get_settings()
    models: list[ModelInfo] = []

    models.append(
        ModelInfo(
            id="auto",
            owned_by="gpushare",
            cost_per_million_tokens=0,
            loaded=True,
            vision_support=False,
        )
    )

    try:
        available = await ollama_list_models()
    except Exception:
        available = []

    try:
        running = set(await ollama_list_running_models())
    except Exception:
        running = set()

    _VISION_NAME_PATTERNS = (
        "llava", "moondream", "bakllava", "vision",
        "minicpm-v", "qwen2-vl", "llama3.2-vision",
    )

    local_cost = get_inference_cost_per_token()
    for model_name in available:
        name_lower = model_name.lower()
        is_vision = any(p in name_lower for p in _VISION_NAME_PATTERNS)
        models.append(
            ModelInfo(
                id=model_name,
                owned_by="local",
                cost_per_million_tokens=float(local_cost * Decimal("1000000"))
                if settings.BILLING_ENABLED
                else 0,
                loaded=model_name in running,
                vision_support=is_vision,
            )
        )

    if settings.OPENROUTER_API_KEY:
        try:
            or_models = await openrouter_list_models()
            for m in or_models:
                pricing = m.get("pricing", {})
                prompt_rate = float(pricing.get("prompt", "0"))
                completion_rate = float(pricing.get("completion", "0"))
                avg_rate = (3 * prompt_rate + completion_rate) / 4
                architecture = m.get("architecture", {})
                input_modalities = architecture.get("input_modalities") or architecture.get("modality", "")
                is_vision = "image" in str(input_modalities).lower()
                models.append(
                    ModelInfo(
                        id=m["id"],
                        owned_by="openrouter",
                        cost_per_million_tokens=round(avg_rate * 1_000_000, 4),
                        vision_support=is_vision,
                    )
                )
        except Exception:
            pass

    return ModelsResponse(data=models)
