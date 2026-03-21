# GPU Node — Architecture & Specification

> v0.1 · 21 March 2026

**Purpose:** An open source template for sharing GPU compute — AI inference and 3D rendering — with trusted users at electricity cost. Self-hostable, fully automated billing, deployable in under an hour.

| Service      | What it does                         | Billing unit       | Backend     |
| ------------ | ------------------------------------ | ------------------ | ----------- |
| AI Inference | LLM chat via OpenAI-compatible API   | Per million tokens | Ollama      |
| 3D Rendering | Blender job queue with file delivery | Per render-minute  | Blender CLI |

---

## 1. System Overview

GPU Node separates concerns cleanly across three layers: a static frontend hosted on Vercel, a lightweight proxy running on your machine, and the GPU backends (Ollama + Blender). Your PC only draws inference/render-level power when actively processing jobs — everything else is always available.

### Architecture

```
Vercel (always on, free tier)          Your PC (via Cloudflare Tunnel)
─────────────────────────────          ──────────────────────────────────────

React frontend (Vite + TanStack Router)  FastAPI proxy

  Login / Signup ─────────────────────►  /v1/auth/*
  Chat UI ────────────────────────────►  /v1/inference/*  ──►  Ollama
  Render UI ──────────────────────────►  /v1/render/*     ──►  Blender CLI
  Account dashboard ──────────────────►  /v1/account/*
  Admin dashboard ────────────────────►  /v1/admin/*

  Auth (JWT + API key)                   Job worker process
  Stripe ─────────────────────────────►  /v1/webhooks/stripe
                                         Cloudflare Tunnel daemon

Neon / Supabase (always on)            Cloudflare R2 (file storage)

  users                                  .blend uploads
  credit_ledger                          render outputs
  usage_logs                             signed download URLs
  render_jobs
  invoices
```

> **Key principle:** The Vercel frontend and database are always reachable. Users can check balances, view invoices, and manage API keys even when your PC is offline. Only chat and render submission require your machine to be up.

---

## 2. Request Flows

### Inference

```
Browser / API client
  │
  ▼
Vercel frontend ──► POST /v1/inference/chat/completions
  │
  FastAPI proxy
    1. Verify JWT or API key
    2. Check balance (soft block at -$20)
    3. Forward to Ollama (localhost:11434)
    4. Stream tokens back to client
    5. Count tokens, write usage_log row
    6. Deduct from credit_ledger
```

### Render

```
Browser uploads .blend file
  │
  ▼
FastAPI proxy
  1. Validate file (strip Python scripts)
  2. Upload to Cloudflare R2
  3. Create render_job row (status: queued)
  4. Return job ID to client
  │
  ▼ (async, job worker process)
  5. Worker picks up queued job
  6. Downloads .blend from R2
  7. Runs: blender --background scene.blend --render-output ...
  8. Writes progress to DB every N frames
  9. Uploads output frames/video to R2
 10. Generates signed download URL (7-day expiry)
 11. Records render_seconds + cost_nzd, writes ledger row
 12. Notifies user via email
```

---

## 3. Repository Structure

```
gpu-node/
├── packages/
│   ├── frontend/                    # Vercel — Vite + React + TanStack Router + Tailwind
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   │   ├── login.tsx        # Login / signup form
│   │   │   │   ├── chat.tsx         # Chat UI with streaming
│   │   │   │   ├── render.tsx       # Render submission + job list
│   │   │   │   ├── account.tsx      # Balance, usage, invoices, API keys
│   │   │   │   └── admin.tsx        # Admin dashboard (owner only)
│   │   │   ├── components/
│   │   │   │   └── layout.tsx       # Dark sidebar layout + navigation
│   │   │   ├── lib/
│   │   │   │   ├── api.ts           # Typed fetch wrappers
│   │   │   │   └── auth.ts          # JWT token management
│   │   │   ├── router.tsx           # TanStack Router setup + route guards
│   │   │   ├── main.tsx             # React entry point
│   │   │   └── app.css              # Tailwind v4 import
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   └── vercel.json
│   ├── server/                      # Runs on your PC
│   │   ├── app/
│   │   │   ├── main.py              # FastAPI entry point
│   │   │   ├── config.py            # Pydantic-settings env loader
│   │   │   ├── database.py          # Async SQLAlchemy engine + session
│   │   │   ├── routers/
│   │   │   │   ├── inference.py     # /v1/inference/* — Ollama proxy
│   │   │   │   ├── render.py        # /v1/render/* — job submission
│   │   │   │   ├── auth.py          # Login, signup, API keys, auth deps
│   │   │   │   ├── billing.py       # Balance, top-up, Stripe webhooks
│   │   │   │   └── admin.py         # Admin endpoints
│   │   │   ├── workers/
│   │   │   │   └── render_worker.py # Async job processor
│   │   │   ├── models/
│   │   │   │   └── models.py        # SQLAlchemy ORM models
│   │   │   ├── schemas/             # Pydantic request/response schemas
│   │   │   │   ├── auth.py
│   │   │   │   ├── billing.py
│   │   │   │   ├── inference.py
│   │   │   │   ├── render.py
│   │   │   │   └── admin.py
│   │   │   └── lib/
│   │   │       ├── billing.py       # Ledger writes, cost calculation
│   │   │       ├── r2.py            # Cloudflare R2 client
│   │   │       ├── blender.py       # Blender CLI wrapper
│   │   │       └── ollama.py        # Ollama client + token counting
│   │   ├── alembic/                 # DB migrations
│   │   │   ├── env.py
│   │   │   ├── script.py.mako
│   │   │   └── versions/
│   │   ├── alembic.ini
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   └── shared/
│       └── types/                   # TypeScript type definitions
│           ├── inference.ts
│           ├── render.ts
│           ├── billing.ts
│           ├── auth.ts
│           └── admin.ts
├── docker-compose.yml               # Spins up server + Ollama + worker
├── .env.example                     # All config variables documented
└── README.md
```

---

## 4. Database Schema

Postgres (hosted on Neon or Supabase free tier). All financial data uses an append-only ledger pattern — balances are always computed as `SUM(amount)`, never stored directly.

### `users`

```sql
id                  uuid PRIMARY KEY DEFAULT gen_random_uuid()
email               text UNIQUE NOT NULL
name                text
password_hash       text NOT NULL                -- bcrypt hash
status              text DEFAULT 'pending'       -- pending|active|suspended
role                text DEFAULT 'user'          -- user|admin
stripe_customer_id  text
billing_type        text DEFAULT 'postpaid'      -- postpaid|prepaid
hard_limit_nzd      numeric DEFAULT -20.00
services_enabled    text[] DEFAULT '{inference,render}'
created_at          timestamptz DEFAULT now()
```

### `api_keys`

```sql
id          uuid PRIMARY KEY
user_id     uuid REFERENCES users(id)
key_hash    text UNIQUE NOT NULL    -- bcrypt hash, never store raw
label       text                    -- 'Home laptop', 'Work', etc.
last_used   timestamptz
created_at  timestamptz DEFAULT now()
revoked_at  timestamptz             -- null = active
```

### `credit_ledger` (append-only, never UPDATE)

```sql
id          uuid PRIMARY KEY
user_id     uuid REFERENCES users(id)
amount      numeric NOT NULL        -- positive=credit, negative=charge
type        text NOT NULL           -- topup|inference_usage|render_usage|invoice|adjustment
description text                    -- human-readable detail
stripe_id   text                    -- payment intent or invoice ID
created_at  timestamptz DEFAULT now()

-- Balance query:
-- SELECT SUM(amount) FROM credit_ledger WHERE user_id = $1
```

### `usage_logs` (inference)

```sql
id            uuid PRIMARY KEY
user_id       uuid REFERENCES users(id)
model         text NOT NULL       -- 'qwen2.5:14b', 'llama3.1:8b'
input_tokens  int
output_tokens int
cost_nzd      numeric
kwh           numeric             -- actual energy for this request
created_at    timestamptz DEFAULT now()
```

### `render_jobs`

```sql
id                  uuid PRIMARY KEY
user_id             uuid REFERENCES users(id)
status              text DEFAULT 'queued'   -- queued|rendering|complete|failed
engine              text NOT NULL           -- cycles|eevee
frame_start         int DEFAULT 1
frame_end           int DEFAULT 1           -- same as start = single frame
samples             int
resolution_x        int DEFAULT 1920
resolution_y        int DEFAULT 1080
output_format       text DEFAULT 'PNG'      -- PNG|EXR|MP4
blend_file_key      text NOT NULL           -- R2 object key
output_key          text                    -- R2 object key (zip of frames)
download_url        text                    -- signed, 7-day expiry
download_expires    timestamptz
frames_done         int DEFAULT 0           -- for progress
render_seconds      numeric                 -- populated on completion
cost_nzd            numeric                 -- populated on completion
error_message       text
created_at          timestamptz DEFAULT now()
started_at          timestamptz
completed_at        timestamptz
```

### `invoices`

```sql
id                uuid PRIMARY KEY
user_id           uuid REFERENCES users(id)
period_start      date NOT NULL
period_end        date NOT NULL
amount_nzd        numeric NOT NULL
stripe_invoice_id text
status            text DEFAULT 'pending'  -- pending|paid|failed|void
created_at        timestamptz DEFAULT now()
paid_at           timestamptz
```

---

## 5. Billing Model

### Cost calculation

|                          | Formula                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| **Inference cost/token** | `(GPU_INFERENCE_WATTS + SYSTEM_WATTS) / 1000 × ELECTRICITY_RATE_KWH / 3600 / tokens_per_sec` |
| **Render cost/minute**   | `(GPU_RENDER_WATTS + SYSTEM_WATTS) / 1000 × ELECTRICITY_RATE_KWH / 60`                       |
| **Example (Wellington)** | Inference: ~$0.28/M tokens · Render: ~$0.22/hr                                               |

All rates are derived from config at runtime — no hardcoded prices. Changing your electricity rate updates costs automatically for all future usage.

### Balance states

| Balance range | UI indicator           | API behaviour            | Email trigger                   |
| ------------- | ---------------------- | ------------------------ | ------------------------------- |
| Above $0      | Green dot              | Normal                   | —                               |
| $0 to -$5     | Yellow warning banner  | Normal (soft limit)      | Low balance warning             |
| -$5 to -$20   | Orange banner          | Normal (soft limit)      | In the red notice               |
| Below -$20    | Red banner, hard block | HTTP 402 on new requests | Hard block notice + admin alert |

> **Design note:** The -$20 hard block is the escape hatch. Soft limits mean you trust your users — but there must be a floor. Set per-user via `users.hard_limit_nzd` for flexibility.

### Monthly billing flow

```
1st of month (cron job)
  │
  ├── For each user with non-zero usage in the past month:
  │     1. Sum usage_logs for the period → amount_nzd
  │     2. Create invoice row (status: pending)
  │     3. Create Stripe Invoice → attach to saved payment method
  │     4. Stripe sends PDF receipt automatically
  │
  Stripe webhook: invoice.paid
  │
  └── Write credit_ledger row (type: invoice, amount: +amount_nzd)
      Mark invoice status: paid

  If payment fails:
    Stripe retries 3× over 7 days → notifies user each time
    After 3 failures → webhook fires → admin notification sent
```

---

## 6. API Reference

Most endpoints require a `Bearer` token (JWT from login) or `X-API-Key` header. The inference endpoints are OpenAI-compatible — any client that works with OpenAI works here.

### Auth

| Method | Path                        | Description                    | Auth     |
| ------ | --------------------------- | ------------------------------ | -------- |
| POST   | `/v1/auth/signup`           | Register new account           | None     |
| POST   | `/v1/auth/login`            | Authenticate, receive JWT      | None     |
| GET    | `/v1/auth/me`               | Current user profile           | JWT/Key  |
| POST   | `/v1/auth/api-keys`         | Create new API key             | JWT/Key  |
| GET    | `/v1/auth/api-keys`         | List API keys (non-revoked)    | JWT/Key  |
| DELETE | `/v1/auth/api-keys/:id`     | Revoke API key                 | JWT/Key  |

### Inference

| Method | Path                             | Description                        | Auth           |
| ------ | -------------------------------- | ---------------------------------- | -------------- |
| POST   | `/v1/inference/chat/completions` | OpenAI-compatible chat (streaming) | JWT or API key |
| GET    | `/v1/inference/models`           | List available models with rates   | JWT or API key |

### Render

| Method | Path                  | Description                                          | Auth     |
| ------ | --------------------- | ---------------------------------------------------- | -------- |
| POST   | `/v1/render/jobs`     | Submit new render job (multipart, .blend + settings) | JWT/Key  |
| GET    | `/v1/render/jobs`     | List your jobs with status + progress                | JWT/Key  |
| GET    | `/v1/render/jobs/:id` | Single job detail + download URL                     | JWT/Key  |
| DELETE | `/v1/render/jobs/:id` | Cancel queued job                                    | JWT/Key  |

### Account

| Method | Path                   | Description                          | Auth     |
| ------ | ---------------------- | ------------------------------------ | -------- |
| GET    | `/v1/account/balance`  | Current balance + this-month summary | JWT/Key  |
| GET    | `/v1/account/usage`    | Usage log (paginated, limit/offset)  | JWT/Key  |
| GET    | `/v1/account/invoices` | Invoice history                      | JWT/Key  |
| POST   | `/v1/account/topup`    | Initiate Stripe Checkout top-up      | JWT/Key  |

### Admin

| Method | Path                                  | Description                     | Auth  |
| ------ | ------------------------------------- | ------------------------------- | ----- |
| GET    | `/v1/admin/users`                     | List all users with balances    | Admin |
| GET    | `/v1/admin/users/:id`                 | Single user with balance        | Admin |
| PATCH  | `/v1/admin/users/:id`                 | Update user fields              | Admin |
| POST   | `/v1/admin/users/:id/adjust-balance`  | Adjust user balance             | Admin |
| GET    | `/v1/admin/stats`                     | System-wide statistics          | Admin |

### Webhooks

| Method | Path                   | Description                  | Auth            |
| ------ | ---------------------- | ---------------------------- | --------------- |
| POST   | `/v1/webhooks/stripe`  | Stripe event receiver        | Stripe signature |

### Health

| Method | Path      | Description          | Auth |
| ------ | --------- | -------------------- | ---- |
| GET    | `/health` | Server health check  | None |

---

## 7. Security

### API key storage

- Raw API keys are shown once on creation and never stored
- Key format: `gn_{uuid}_{random}` — the UUID portion matches the `api_keys.id` column for fast lookup
- Only the bcrypt hash of the full key is persisted in `api_keys.key_hash`
- To authenticate: extract the UUID from the key, look up the row by `id`, then bcrypt-verify the full key against `key_hash`
- Keys are prefixed with `gn_` for easy identification in logs

### Blender file sanitisation

Running arbitrary `.blend` files from other users is the highest-risk surface in this stack. Two mitigations:

**Mandatory:** Strip embedded Python scripts on ingestion — run a headless Blender sanitisation pass before queuing any job. This removes all Text data blocks with `.py` extension.

**Recommended:** Run each Blender job in a Docker container with `--network none` and read-only mounts except the output directory. Adds ~60s overhead, fully contains damage.

```bash
# Sanitisation script (runs before job is queued)
blender --background dirty.blend \
  --python sanitise.py \
  --render-output /dev/null
```

```python
# sanitise.py removes all Python text blocks
import bpy
for text in list(bpy.data.texts):
    if text.name.endswith('.py') or text.as_string().strip():
        bpy.data.texts.remove(text)
bpy.ops.wm.save_as_mainfile(filepath='clean.blend')
```

### Rate limiting

- Per-user rate limiting on inference: configurable requests/minute in `.env`
- Render jobs queued sequentially per user — no parallel job flooding
- File upload size limit: 500MB per `.blend` file (configurable)

### Network exposure

- Ollama binds to localhost only — never exposed through the tunnel
- Blender CLI has no network access when running inside the worker
- All external traffic enters through Cloudflare Tunnel (no open ports on your router)

---

## 8. Configuration Reference

Copy `.env.example` and fill in the required fields before first run.

### Required

```env
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/gpunode
JWT_SECRET=<random 64-char string>
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
CLOUDFLARE_R2_ACCOUNT_ID=...
CLOUDFLARE_R2_ACCESS_KEY_ID=...
CLOUDFLARE_R2_SECRET_ACCESS_KEY=...
CLOUDFLARE_R2_BUCKET=gpu-node-files
RESEND_API_KEY=re_...              # transactional email
```

### Services and compute

```env
SERVICES_ENABLED=inference,render  # comma-separated, or just one
MODELS=qwen2.5:14b,llama3.1:8b    # Ollama model identifiers
OLLAMA_HOST=http://localhost:11434
OLLAMA_KEEP_ALIVE=15m              # model unload timeout
BLENDER_PATH=/usr/bin/blender
BLENDER_MAX_CONCURRENT_JOBS=1      # increase if you have headroom
```

### Billing

```env
ELECTRICITY_RATE_KWH=0.346         # your rate in local currency
CURRENCY=NZD                       # ISO 4217
GPU_INFERENCE_WATTS=150            # GPU draw during inference
GPU_RENDER_WATTS=300               # GPU draw during Cycles render
SYSTEM_WATTS=80                    # CPU + RAM + drives
BILLING_ENABLED=true               # false = track usage, skip payments
SOFT_LIMIT_WARN=-5.00              # balance threshold for orange warning
HARD_LIMIT_DEFAULT=-20.00          # per-user override in DB
INVOICE_DAY=1                      # day of month to generate invoices
```

### Signup and access

```env
INVITE_ONLY=true                   # false = open self-signup
REQUIRE_APPROVAL=true              # admin must approve new accounts
NODE_NAME=My GPU Node              # shown in the UI header
ADMIN_EMAIL=you@example.com        # receives alerts and approvals
```

---

## 9. Stack Summary

| Concern           | Choice                     | Why                                                 | Cost       |
| ----------------- | -------------------------- | --------------------------------------------------- | ---------- |
| Inference backend | Ollama                     | OpenAI-compatible, model switching, VRAM management | Free       |
| Render backend    | Blender CLI (headless)     | Scriptable, GPU-accelerated, Cycles + EEVEE         | Free       |
| API server        | FastAPI (Python)           | Async, streaming support, great for GPU workloads   | Free       |
| Database          | Postgres via Neon          | Reliable, free tier, Postgres for financial data    | Free       |
| File storage      | Cloudflare R2              | Free egress (unlike S3), S3-compatible API, cheap   | ~$0/mo     |
| Frontend          | Vite + React + TanStack Router + Tailwind v4 on Vercel | Static deploy, free tier, instant CDN    | Free       |
| Tunnel            | Cloudflare Tunnel          | No port forwarding, survives IP changes, free       | Free       |
| Payments          | Stripe                     | Invoicing, webhooks, Customer Portal all built in   | 2.9% + 30c |
| Email             | Resend                     | Simple API, free tier, great deliverability         | Free       |
| GPU metrics       | Tapo P110 smart plug       | Real wattage data, calibrates cost model            | ~$30 once  |

**Total ongoing infrastructure cost** (excluding electricity): ~$0/month until Stripe transaction volume or R2 storage becomes significant.
