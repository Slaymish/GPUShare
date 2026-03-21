"""Server status and GPU health endpoint for OpenClaw/external clients."""

from __future__ import annotations

import subprocess
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.lib.ollama import list_models as ollama_list_models
from app.models import RenderJob

router = APIRouter(prefix="/v1", tags=["status"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class GpuInfo(BaseModel):
    name: str
    vram_total_mb: int
    vram_used_mb: int
    utilization_pct: int


class StatusResponse(BaseModel):
    status: str  # "available" | "busy" | "offline"
    gpu: Optional[GpuInfo] = None
    models_loaded: list[str] = []
    queue_depth: int = 0
    estimated_wait_seconds: int = 0
    electricity_rate_nzd_kwh: float = 0.0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_gpu_info() -> GpuInfo | None:
    """Query nvidia-smi for GPU stats. Returns None if unavailable."""
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

        # Parse first GPU line: "NVIDIA RTX 5070 Ti, 16384, 4200, 12"
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


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.get("/status", response_model=StatusResponse)
async def get_status(
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint — returns GPU availability, loaded models, and queue depth.

    No authentication required. Designed for OpenClaw skills and status badges.
    """
    settings = get_settings()

    # GPU info
    gpu = _get_gpu_info()

    # Loaded Ollama models
    models_loaded: list[str] = []
    ollama_reachable = False
    try:
        models_loaded = await ollama_list_models()
        ollama_reachable = True
    except Exception:
        pass

    # Render queue depth
    queue_result = await db.execute(
        select(func.count()).select_from(RenderJob).where(RenderJob.status == "queued")
    )
    queue_depth = queue_result.scalar_one()

    # Determine overall status
    if not ollama_reachable and gpu is None:
        overall_status = "offline"
    elif gpu and gpu.utilization_pct > 90:
        overall_status = "busy"
    elif queue_depth > 0:
        overall_status = "busy"
    else:
        overall_status = "available"

    # Rough wait estimate: ~30s per queued job
    estimated_wait = queue_depth * 30 if queue_depth > 0 else 0

    return StatusResponse(
        status=overall_status,
        gpu=gpu,
        models_loaded=models_loaded,
        queue_depth=queue_depth,
        estimated_wait_seconds=estimated_wait,
        electricity_rate_nzd_kwh=settings.ELECTRICITY_RATE_KWH,
    )
