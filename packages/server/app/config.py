"""Application configuration loaded from environment variables."""

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
    ADMIN_EMAIL: str = "admin@localhost"

    # ── Optional services (set to empty string to disable) ────────────
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    CLOUDFLARE_R2_ACCOUNT_ID: str = ""
    CLOUDFLARE_R2_ACCESS_KEY_ID: str = ""
    CLOUDFLARE_R2_SECRET_ACCESS_KEY: str = ""
    CLOUDFLARE_R2_BUCKET: str = "gpu-node-files"
    RESEND_API_KEY: str = ""
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_MODELS: str = ""  # comma-separated, e.g. "openai/gpt-4o,anthropic/claude-sonnet-4"

    # ── Services & compute ───────────────────────────────────────────────
    SERVICES_ENABLED: str = "inference,render"
    MODELS: str = "qwen2.5:14b,llama3.1:8b"
    OLLAMA_HOST: str = "http://localhost:11434"
    OLLAMA_KEEP_ALIVE: str = "15m"
    BLENDER_PATH: str = "/usr/bin/blender"
    BLENDER_MAX_CONCURRENT_JOBS: int = 1

    # ── Billing ──────────────────────────────────────────────────────────
    ELECTRICITY_RATE_KWH: float = 0.346
    CURRENCY: str = "NZD"
    GPU_INFERENCE_WATTS: float = 150
    GPU_RENDER_WATTS: float = 300
    SYSTEM_WATTS: float = 80
    BILLING_ENABLED: bool = True
    SOFT_LIMIT_WARN: float = -5.00
    HARD_LIMIT_DEFAULT: float = -20.00
    INVOICE_DAY: int = 1

    # ── Signup & access ──────────────────────────────────────────────────
    INVITE_ONLY: bool = True
    REQUIRE_APPROVAL: bool = True
    NODE_NAME: str = "My GPU Node"
    INITIAL_ADMIN_BOOTSTRAP_TOKEN: str = ""

    # ── Tapo smart plug (energy monitoring) ──────────────────────────────
    TAPO_EMAIL: str = ""
    TAPO_PASSWORD: str = ""
    TAPO_DEVICE_IP: str = ""

    # ── Skills ────────────────────────────────────────────────────────────
    SKILLS_DIR: str = "skills"

    # ── Cloudflare Tunnel ────────────────────────────────────────────────
    TUNNEL_TOKEN: str = ""

    # ── Helper properties ────────────────────────────────────────────────
    @property
    def services_list(self) -> list[str]:
        """Return SERVICES_ENABLED split into a list."""
        return [s.strip() for s in self.SERVICES_ENABLED.split(",") if s.strip()]

    @property
    def models_list(self) -> list[str]:
        """Return MODELS split into a list."""
        return [m.strip() for m in self.MODELS.split(",") if m.strip()]

    @property
    def openrouter_models_list(self) -> list[str]:
        return [m.strip() for m in self.OPENROUTER_MODELS.split(",") if m.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance (reads .env once)."""
    return Settings()
