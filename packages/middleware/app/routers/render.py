"""Render router — list/get jobs from DB; submit/cancel proxied to backend."""

from __future__ import annotations

import uuid

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.backend_client import get_backend_client, _make_internal_headers
from app.database import get_db
from app.models import RenderJob, User
from app.schemas.render import RenderJobResponse

router = APIRouter(prefix="/v1/render", tags=["render"])


@router.post("/jobs", response_model=RenderJobResponse, status_code=status.HTTP_201_CREATED)
async def create_render_job(
    file: UploadFile = File(...),
    engine: str = Form("cycles"),
    frame_start: int = Form(1),
    frame_end: int = Form(1),
    samples: int | None = Form(None),
    resolution_x: int = Form(1920),
    resolution_y: int = Form(1080),
    output_format: str = Form("PNG"),
    user: User = Depends(get_current_user),
):
    """Forward the file upload to the backend for sanitisation, R2 upload, and queuing."""
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    headers = _make_internal_headers(user_id=str(user.id))
    contents = await file.read()

    form_data = {
        "engine": engine,
        "frame_start": str(frame_start),
        "frame_end": str(frame_end),
        "resolution_x": str(resolution_x),
        "resolution_y": str(resolution_y),
        "output_format": output_format,
    }
    if samples is not None:
        form_data["samples"] = str(samples)

    files = {"file": (file.filename, contents, "application/octet-stream")}

    try:
        async with get_backend_client() as client:
            resp = await client.post(
                "/internal/render/jobs",
                data=form_data,
                files=files,
                headers=headers,
                timeout=httpx.Timeout(120.0, connect=10.0),
            )
            resp.raise_for_status()
            return RenderJobResponse(**resp.json())
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Backend unavailable: {exc}")


@router.get("/jobs", response_model=list[RenderJobResponse])
async def list_render_jobs(
    limit: int = 20,
    offset: int = 0,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(RenderJob)
        .where(RenderJob.user_id == user.id)
        .order_by(RenderJob.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return [RenderJobResponse.model_validate(j) for j in result.scalars().all()]


@router.get("/jobs/{job_id}", response_model=RenderJobResponse)
async def get_render_job(
    job_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(RenderJob).where(RenderJob.id == job_id, RenderJob.user_id == user.id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Render job not found.")
    return RenderJobResponse.model_validate(job)


@router.delete("/jobs/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_render_job(
    job_id: uuid.UUID,
    user: User = Depends(get_current_user),
):
    """Proxy cancel to backend (it handles R2 file deletion and DB row removal)."""
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    headers = _make_internal_headers(user_id=str(user.id))
    try:
        async with get_backend_client() as client:
            resp = await client.delete(
                f"/internal/render/jobs/{job_id}",
                headers=headers,
            )
            resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Backend unavailable: {exc}")
