"""Blender render-job schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class RenderJobCreateRequest(BaseModel):
    engine: Literal["cycles", "eevee"]
    frame_start: int = 1
    frame_end: int = 1
    samples: int | None = None
    resolution_x: int = 1920
    resolution_y: int = 1080
    output_format: str = "PNG"


class RenderJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: str
    engine: str
    frame_start: int
    frame_end: int
    samples: int | None
    resolution_x: int
    resolution_y: int
    output_format: str
    frames_done: int
    render_seconds: float | None
    cost_nzd: float | None
    download_url: str | None
    download_expires: datetime | None
    error_message: str | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
