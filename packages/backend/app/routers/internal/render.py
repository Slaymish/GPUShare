"""Internal render endpoints — called by middleware with X-User-Id header."""

from __future__ import annotations

import os
import tempfile
import uuid

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.lib.billing import check_balance_ok
from app.lib.blender import sanitise_blend_file
from app.lib.r2 import delete_file, upload_file
from app.models import RenderJob, User
from app.schemas.render import RenderJobResponse

router = APIRouter(prefix="/internal/render", tags=["internal"])

MAX_BLEND_SIZE = 500 * 1024 * 1024  # 500 MB


@router.post("/jobs", response_model=RenderJobResponse, status_code=status.HTTP_201_CREATED)
async def internal_create_render_job(
    file: UploadFile = File(...),
    engine: str = Form("cycles"),
    frame_start: int = Form(1),
    frame_end: int = Form(1),
    samples: int | None = Form(None),
    resolution_x: int = Form(1920),
    resolution_y: int = Form(1080),
    output_format: str = Form("PNG"),
    x_user_id: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """Create a render job — validate, sanitise, upload to R2, queue."""
    user_id = uuid.UUID(x_user_id)
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    if not file.filename or not file.filename.lower().endswith(".blend"):
        raise HTTPException(status_code=400, detail="Only .blend files are accepted.")

    contents = await file.read()
    if len(contents) > MAX_BLEND_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is {MAX_BLEND_SIZE // (1024 * 1024)} MB.",
        )

    balance_ok = await check_balance_ok(db, user.id, user.hard_limit_nzd)
    if not balance_ok:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Insufficient balance. Please top up your account.",
        )

    job_id = uuid.uuid4()
    tmp_input = os.path.join(tempfile.gettempdir(), f"{job_id}_input.blend")
    tmp_sanitised = os.path.join(tempfile.gettempdir(), f"{job_id}_clean.blend")

    try:
        with open(tmp_input, "wb") as f:
            f.write(contents)
        await sanitise_blend_file(tmp_input, tmp_sanitised)
        r2_key = f"blends/{user.id}/{job_id}.blend"
        with open(tmp_sanitised, "rb") as f:
            upload_file(f, r2_key, content_type="application/x-blender")
    finally:
        for path in (tmp_input, tmp_sanitised):
            if os.path.exists(path):
                os.remove(path)

    job = RenderJob(
        id=job_id,
        user_id=user.id,
        status="queued",
        engine=engine,
        frame_start=frame_start,
        frame_end=frame_end,
        samples=samples,
        resolution_x=resolution_x,
        resolution_y=resolution_y,
        output_format=output_format,
        blend_file_key=r2_key,
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    return RenderJobResponse.model_validate(job)


@router.delete("/jobs/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def internal_cancel_render_job(
    job_id: uuid.UUID,
    x_user_id: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """Cancel a queued render job and delete associated R2 files."""
    user_id = uuid.UUID(x_user_id)
    result = await db.execute(
        select(RenderJob).where(RenderJob.id == job_id, RenderJob.user_id == user_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Render job not found.")

    if job.status != "queued":
        raise HTTPException(
            status_code=409,
            detail=f"Cannot cancel a job with status '{job.status}'.",
        )

    try:
        delete_file(job.blend_file_key)
    except Exception:
        pass

    await db.delete(job)
