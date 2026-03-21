"""GPU Node — FastAPI entry point."""

from __future__ import annotations

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
    from app.database import get_engine
    await get_engine().dispose()


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
    import httpx

    # Check Ollama
    ollama_status = "offline"
    ollama_models: list[str] = []
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{settings.OLLAMA_HOST}/api/tags")
            if resp.status_code == 200:
                data = resp.json()
                loaded = data.get("models", [])
                ollama_models = [m["name"] for m in loaded]
                ollama_status = "ready" if loaded else "warming_up"
    except Exception:
        ollama_status = "offline"

    # Check configured integrations
    from app.lib.tapo import is_configured as tapo_configured, get_energy_summary

    integrations = {
        "stripe": bool(settings.STRIPE_SECRET_KEY and settings.STRIPE_SECRET_KEY != "sk_test_placeholder"),
        "r2": bool(settings.CLOUDFLARE_R2_ACCOUNT_ID and settings.CLOUDFLARE_R2_ACCOUNT_ID != "placeholder"),
        "resend": bool(settings.RESEND_API_KEY and settings.RESEND_API_KEY != "re_placeholder"),
        "billing": settings.BILLING_ENABLED,
        "tapo": tapo_configured(),
    }

    # Fetch live power data from Tapo smart plug
    power = None
    if integrations["tapo"]:
        summary = await get_energy_summary()
        if summary:
            power = {
                "current_watts": summary.current_watts,
                "today_kwh": summary.today_kwh,
                "month_kwh": summary.month_kwh,
                "today_cost": summary.today_cost,
                "month_cost": summary.month_cost,
                "currency": settings.CURRENCY,
                "rate_per_kwh": settings.ELECTRICITY_RATE_KWH,
            }

    return {
        "status": "ok",
        "node": settings.NODE_NAME,
        "services": settings.services_list,
        "ollama": ollama_status,
        "ollama_models": ollama_models,
        "integrations": integrations,
        "power": power,
    }
