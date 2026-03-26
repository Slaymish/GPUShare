"""GPUShare middleware — frontend-facing BFF (Backend for Frontend).

Exposed via Cloudflare Tunnel. Handles auth, aggregation, caching, and
Stripe integration. Proxies hardware operations to the backend service.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import get_settings
from app.routers import (
    account,
    admin,
    auth,
    billing,
    inference,
    invite,
    mcp,
    model_picker,
    openai_compat,
    render,
    skills,
    status,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    from app.database import get_engine

    await get_engine().dispose()


settings = get_settings()

app = FastAPI(
    title="GPUShare API",
    description="GPU compute sharing — AI inference and 3D rendering at electricity cost.",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.state.limiter = auth.limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_default_origins = [
    "https://gpu-share.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000",
]
_extra_origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
_allowed_origins = _default_origins + _extra_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(inference.router)
app.include_router(openai_compat.router)
app.include_router(status.router)
app.include_router(render.router)
app.include_router(billing.router)
app.include_router(billing.webhook_router)
app.include_router(admin.router)
app.include_router(invite.router)
app.include_router(skills.router)
app.include_router(mcp.router)
app.include_router(model_picker.router)
app.include_router(account.router)
