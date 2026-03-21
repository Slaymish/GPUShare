"""GPU Node — FastAPI entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import admin, auth, billing, inference, render


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: nothing needed (DB connection is lazy via SQLAlchemy pool)
    yield
    # Shutdown: dispose engine
    from app.database import engine
    await engine.dispose()


settings = get_settings()

app = FastAPI(
    title=settings.NODE_NAME,
    description="GPU compute sharing — AI inference and 3D rendering at electricity cost.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(inference.router)
app.include_router(render.router)
app.include_router(billing.router)
app.include_router(billing.webhook_router)
app.include_router(admin.router)


@app.get("/health")
async def health():
    return {"status": "ok", "node": settings.NODE_NAME}
