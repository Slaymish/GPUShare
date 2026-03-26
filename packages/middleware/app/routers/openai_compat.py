"""OpenAI-compatible API endpoints at standard /v1/ paths."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models import User
from app.routers.inference import create_chat_completion, list_models as _list_models_handler
from app.schemas.inference import ChatCompletionRequest, ModelInfo, ModelsResponse

router = APIRouter(prefix="/v1", tags=["openai-compat"])


@router.post("/chat/completions")
async def chat_completions(
    body: ChatCompletionRequest,
    user: User = Depends(get_current_user),
):
    return await create_chat_completion(body=body, user=user)


@router.get("/models", response_model=ModelsResponse)
async def list_models(user: User | None = Depends(get_current_user)):
    return await _list_models_handler(user=user)


@router.get("/models/{model_id}", response_model=ModelInfo)
async def get_model(model_id: str, user: User | None = Depends(get_current_user)):
    models_response = await _list_models_handler(user=user)
    for model in models_response.data:
        if model.id == model_id:
            return model
    raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found")
