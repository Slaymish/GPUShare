"""GPUShare backend — internal service, not exposed directly to the internet.

All routes are under /internal/* and require X-Internal-Token authentication.
The middleware service is the only intended caller.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.responses import PlainTextResponse

from app.middleware.internal_auth import require_internal
from app.routers.internal import health, inference, mcp, render


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    from app.database import get_engine

    await get_engine().dispose()


app = FastAPI(
    title="GPUShare Backend",
    description="Internal service — hardware operations, inference, rendering.",
    version="0.1.0",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

app.include_router(health.router, dependencies=[Depends(require_internal)])
app.include_router(inference.router, dependencies=[Depends(require_internal)])
app.include_router(render.router, dependencies=[Depends(require_internal)])
app.include_router(mcp.router, dependencies=[Depends(require_internal)])


@app.get("/ping")
async def ping():
    return {"ok": True}

_SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"


@app.get("/internal/setup-opencode.sh", response_class=PlainTextResponse)
async def setup_opencode_bash(_=Depends(require_internal)):
    return PlainTextResponse(
        (_SCRIPTS_DIR / "setup-opencode.sh").read_text(),
        media_type="text/x-shellscript",
    )


@app.get("/internal/setup-opencode.ps1", response_class=PlainTextResponse)
async def setup_opencode_powershell(_=Depends(require_internal)):
    return PlainTextResponse(
        (_SCRIPTS_DIR / "setup-opencode.ps1").read_text(),
        media_type="text/plain",
    )
