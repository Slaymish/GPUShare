"""Middleware configuration — subset of settings relevant to the BFF layer."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Required ─────────────────────────────────────────────────────────
    DATABASE_URL: str
    JWT_SECRET: str

    # ── Backend service ───────────────────────────────────────────────────
    BACKEND_URL: str = "http://localhost:8080"
    INTERNAL_SECRET: str = ""

    # ── Auth & access ─────────────────────────────────────────────────────
    INVITE_ONLY: bool = True
    REQUIRE_APPROVAL: bool = True
    INITIAL_ADMIN_BOOTSTRAP_TOKEN: str = ""
    FRONTEND_URL: str = ""
    NODE_NAME: str = "My GPUShare"

    # ── Billing ───────────────────────────────────────────────────────────
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    BILLING_ENABLED: bool = True
    HARD_LIMIT_DEFAULT: float = -20.00
    CURRENCY: str = "NZD"

    # ── Email ─────────────────────────────────────────────────────────────
    RESEND_API_KEY: str = ""

    # ── CORS ──────────────────────────────────────────────────────────────
    CORS_ORIGINS: str = ""

    # ── Model picker ──────────────────────────────────────────────────────
    OPENROUTER_API_KEY: str = ""
    ARTIFICIAL_ANALYSIS_API_KEY: str = ""
    ELECTRICITY_RATE_KWH: float = 0.346
    GPU_VRAM_GB: float = 16.0
    GPU_INFERENCE_WATTS: float = 200.0
    SYSTEM_WATTS: float = 50.0

    # ── Skills ────────────────────────────────────────────────────────────
    SKILLS_DIR: str = "skills"

    # ── Services ──────────────────────────────────────────────────────────
    SERVICES_ENABLED: str = "inference,render"

    @property
    def services_list(self) -> list[str]:
        return [s.strip() for s in self.SERVICES_ENABLED.split(",") if s.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
