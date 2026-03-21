"""OpenAI-compatible API endpoints at standard /v1/ paths.

This is a thin routing layer that maps standard OpenAI API paths
(/v1/chat/completions, /v1/models) to the existing inference logic.
It enables any OpenAI-compatible client (including OpenClaw skills)
to talk to GPUShare without modification.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User
from app.routers.auth import get_current_user
from app.routers.inference import (
    create_chat_completion,
    list_models as _list_models_handler,
)
from app.schemas.inference import (
    ChatCompletionRequest,
    ModelInfo,
    ModelsResponse,
)

router = APIRouter(prefix="/v1", tags=["openai-compat"])


# ---------------------------------------------------------------------------
# POST /v1/chat/completions
# ---------------------------------------------------------------------------


@router.post("/chat/completions")
async def chat_completions(
    body: ChatCompletionRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """OpenAI-compatible chat completion — delegates to the inference handler."""
    return await create_chat_completion(body=body, user=user, db=db)


# ---------------------------------------------------------------------------
# GET /v1/models
# ---------------------------------------------------------------------------


@router.get("/models", response_model=ModelsResponse)
async def list_models(
    user: User = Depends(get_current_user),
):
    """List available models in OpenAI format."""
    return await _list_models_handler(user=user)


# ---------------------------------------------------------------------------
# GET /v1/models/{model_id}
# ---------------------------------------------------------------------------


@router.get("/models/{model_id}", response_model=ModelInfo)
async def get_model(
    model_id: str,
    user: User = Depends(get_current_user),
):
    """Return a single model's details."""
    models_response = await _list_models_handler(user=user)
    for model in models_response.data:
        if model.id == model_id:
            return model
    raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found")
