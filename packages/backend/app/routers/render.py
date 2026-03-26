"""Render router — submit, list, inspect, and cancel Blender render jobs."""

from __future__ import annotations

import os
import tempfile
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.lib.billing import check_balance_ok, get_balance
from app.lib.blender import sanitise_blend_file
from app.lib.r2 import delete_file, upload_file
from app.models import RenderJob, User
from app.routers.auth import get_current_user
from app.schemas.render import RenderJobCreateRequest, RenderJobResponse

router = APIRouter(prefix="/v1/render", tags=["render"])

MAX_BLEND_SIZE = 500 * 1024 * 1024  # 500 MB


# ---------------------------------------------------------------------------
# POST /jobs — create a new render job
# ---------------------------------------------------------------------------

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
    db: AsyncSession = Depends(get_db),
):
    """Upload a .blend file and queue a render job."""

    # Validate file extension
    if not file.filename or not file.filename.lower().endswith(".blend"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .blend files are accepted.",
        )

    # Validate file size (read into memory to check)
    contents = await file.read()
    if len(contents) > MAX_BLEND_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size is {MAX_BLEND_SIZE // (1024 * 1024)} MB.",
        )

    # Check balance
    balance_ok = await check_balance_ok(db, user.id, user.hard_limit_nzd)
    if not balance_ok:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Insufficient balance. Please top up your account.",
        )

    job_id = uuid.uuid4()

    # Write uploaded file to temp location
    tmp_input = os.path.join(tempfile.gettempdir(), f"{job_id}_input.blend")
    tmp_sanitised = os.path.join(tempfile.gettempdir(), f"{job_id}_clean.blend")

    try:
        with open(tmp_input, "wb") as f:
            f.write(contents)

        # Sanitise the blend file (remove embedded scripts)
        await sanitise_blend_file(tmp_input, tmp_sanitised)

        # Upload sanitised file to R2
        r2_key = f"blends/{user.id}/{job_id}.blend"
        with open(tmp_sanitised, "rb") as f:
            upload_file(f, r2_key, content_type="application/x-blender")
    finally:
        # Clean up temp files
        for path in (tmp_input, tmp_sanitised):
            if os.path.exists(path):
                os.remove(path)

    # Create the render job in the database
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


# ---------------------------------------------------------------------------
# GET /jobs — list user's render jobs
# ---------------------------------------------------------------------------

@router.get("/jobs", response_model=list[RenderJobResponse])
async def list_render_jobs(
    limit: int = 20,
    offset: int = 0,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List the authenticated user's render jobs, newest first."""
    result = await db.execute(
        select(RenderJob)
        .where(RenderJob.user_id == user.id)
        .order_by(RenderJob.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    jobs = result.scalars().all()
    return [RenderJobResponse.model_validate(j) for j in jobs]


# ---------------------------------------------------------------------------
# GET /jobs/{job_id} — get a single render job
# ---------------------------------------------------------------------------

@router.get("/jobs/{job_id}", response_model=RenderJobResponse)
async def get_render_job(
    job_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get details of a single render job (must belong to the authenticated user)."""
    result = await db.execute(
        select(RenderJob).where(RenderJob.id == job_id, RenderJob.user_id == user.id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Render job not found.",
        )
    return RenderJobResponse.model_validate(job)


# ---------------------------------------------------------------------------
# DELETE /jobs/{job_id} — cancel a queued render job
# ---------------------------------------------------------------------------

@router.delete("/jobs/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_render_job(
    job_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel a queued render job and delete associated files."""
    result = await db.execute(
        select(RenderJob).where(RenderJob.id == job_id, RenderJob.user_id == user.id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Render job not found.",
        )

    if job.status != "queued":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot cancel a job with status '{job.status}'. Only queued jobs can be cancelled.",
        )

    # Delete the blend file from R2
    try:
        delete_file(job.blend_file_key)
    except Exception:
        pass  # Best-effort cleanup; don't fail the cancellation

    await db.delete(job)
