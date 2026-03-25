# AGENTS.md

## Project

GPUShare — a self-hostable platform for sharing GPU compute (AI inference via Ollama + OpenRouter, 3D rendering via Blender) with trusted users, billed at electricity cost. Monorepo: FastAPI backend, React 19 frontend, shared TypeScript types.

## Build & Commands

### Server (`packages/server/`)

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload              # dev server on :8000
alembic revision --autogenerate -m "msg"   # generate migration
alembic upgrade head                        # apply migrations
python -m app.workers.render_worker         # run render worker
docker compose up -d                        # full stack
```

### Frontend (`packages/frontend/`)

```bash
pnpm install
pnpm dev          # vite dev server
pnpm build        # tsc typecheck + vite production build
```

### Root (from repo root)

```bash
pnpm build               # build frontend
pnpm db:migrate           # alembic upgrade head via docker
pnpm db:revision          # generate migration via docker
pnpm docker:up / :down / :logs / :rebuild
pnpm server:shell         # bash into fastapi container
```

### Single file operations

There is no test suite or linter configured. The only verification is `pnpm build` (frontend typecheck + build) and running the FastAPI server to verify Python changes. For Python, manually check with `python -c "import app.main"` or by hitting the `/health` endpoint.

## Architecture

### Two-process server
`app/main.py` is the FastAPI app. `app/workers/render_worker.py` is a **separate process** that polls the DB for queued render jobs using `async_session` directly (not via FastAPI deps). Both run in Docker with GPU access.

### Auth dependency chain
`get_current_user()` in `app/routers/auth.py` is the single auth dependency. Checks `Authorization: Bearer <JWT>` and `X-API-Key` headers. API key format: `gpus_sk_<uuid>_<random>`. `require_admin()` wraps it with a role check. Other routers import directly from `app.routers.auth`.

### Append-only credit ledger
`credit_ledger` rows are **never updated or deleted**. Balance = `SUM(amount) WHERE user_id = X`. Negative amounts = usage charges, positive = credits/payments. Entry types: `topup`, `invoice_payment`, `inference_usage`, `render_usage`, `adjustment`. Helpers in `app/lib/billing.py`.

### Cost calculation
All pricing derives from `ELECTRICITY_RATE_KWH` and GPU wattage config — no hardcoded prices. `calculate_inference_cost()` and `calculate_render_cost()` return `(cost_nzd, kwh)` tuples.

### Database
Async SQLAlchemy with `asyncpg`. `get_db()` yields `AsyncSession` with auto-commit/rollback. Models use `mapped_column` style with UUID PKs and `server_default=text("gen_random_uuid()")`.

### Config
Pydantic-settings (`app/config.py`) loads from `.env`. `get_settings()` is `@lru_cache`d. `Settings` has `.services_list` and `.models_list` computed properties.

### Frontend routing
TanStack Router with `beforeLoad` guards redirecting unauthenticated users to `/login`. JWT stored in localStorage, parsed for `sub`/`role`/`exp` client-side. Admin route checks JWT role claim. Shared types live in `packages/shared/types/` and are imported via `@shared/*` path alias.

## Code Style

### Python

- **Imports**: group stdlib, third-party, local with blank lines between. Use `from __future__ import annotations` at top of every module.
- **Formatting**: no formatter enforced; follow existing style — double quotes, no trailing commas unless in multi-line structures.
- **Types**: use type annotations everywhere. Use `Mapped[...]` + `mapped_column` for ORM models. Use Pydantic v2 schemas (`BaseModel`) for request/response DTOs in `app/schemas/`.
- **Naming**: snake_case for functions/variables/modules, PascalCase for classes. Private helpers prefixed with `_`. Router files named after their domain (`auth.py`, `billing.py`).
- **Async**: all DB operations use `async/await`. Use `AsyncSession` from SQLAlchemy. Endpoints are `async def`.
- **Error handling**: raise `HTTPException(status_code=..., detail=...)` for client errors. Use `try/except` around external service calls (Ollama, Stripe, R2) — log or swallow gracefully where appropriate.
- **Config access**: use `get_settings()` (cached), never read env vars directly.
- **DB session pattern**: `db: AsyncSession = Depends(get_db)` — session auto-commits on success, rolls back on exception. Never call `commit()` manually in a route unless inside an async generator (streaming).

### TypeScript / React

- **Strict mode** enabled (`tsconfig.json`: `"strict": true`).
- **Target**: ES2022, module ESNext, bundler resolution.
- **Imports**: use `type` imports for types (`import type { ... }`). Path alias `@shared/*` maps to `packages/shared/*`.
- **Components**: functional components with hooks. Use TanStack Router for routing (file-based pattern in `router.tsx`).
- **Styling**: Tailwind CSS v4 utility classes. Component primitives from Radix UI in `components/ui/`.
- **API layer**: centralized in `src/lib/api.ts` with typed wrapper functions. Use the `ApiError` class for error handling.
- **Auth**: JWT stored in localStorage, parsed client-side via `src/lib/auth.ts`. `beforeLoad` guards on routes.

### Shared types (`packages/shared/types/`)

- Mirror the backend Pydantic schemas. One file per domain: `auth.ts`, `billing.ts`, `inference.ts`, `render.ts`, `admin.ts`, `skills.ts`.
- Export interfaces/types matching the FastAPI response models exactly.
