# GPU Node

Share your GPU compute — AI inference and 3D rendering — with trusted users at electricity cost. Self-hostable, fully automated billing, deployable in under an hour.

## What it does

| Service      | API                               | Billed by          |
| ------------ | --------------------------------- | ------------------ |
| AI Inference | OpenAI-compatible chat API        | Per million tokens |
| 3D Rendering | Blender job queue + file delivery | Per render-minute  |

Costs are derived from your actual electricity rate and GPU wattage — no margins, no markups.

## Use with OpenClaw

If someone has shared their GPUShare server with you:

1. `clawhub install gpushare`
2. Add to your OpenClaw config:
   ```
   GPUSHARE_API_URL=<url they gave you>
   GPUSHARE_API_KEY=<key they gave you>
   ```
3. Ask your agent to use GPUShare.

That's it. Your agent can now run models on their GPU.

## How it works

Your PC runs a FastAPI proxy behind a Cloudflare Tunnel. A React frontend on Vercel handles the UI. A Postgres database (Neon/Supabase free tier) and Cloudflare R2 handle persistence. Stripe handles billing.

```
Vercel (always on)          Your PC (via Cloudflare Tunnel)
──────────────────          ────────────────────────────────
React frontend    ────────► FastAPI proxy ──► Ollama
                            Job worker   ──► Blender CLI
Neon / Supabase             Cloudflare R2
  users, ledger,              .blend files,
  jobs, invoices              rendered output
```

The frontend and database stay reachable even when your PC is off. Users can check balances and view invoices any time. Only inference and render submission need your machine up.

## Prerequisites

- **Docker + Docker Compose**
- **A free Postgres database** — [Supabase](https://supabase.com) or [Neon](https://neon.tech) (free tier is fine)

Everything else (Ollama, Cloudflare Tunnel) is installed automatically by the setup script. Stripe, R2, and Resend are optional and can be added later.

## Quick start

```bash
git clone https://github.com/yourname/gpu-node.git
cd gpu-node
pnpm install      # Install all dependencies
pnpm dev          # Start frontend and backend together
```

Or use the automated setup:

```bash
./setup.sh        # macOS / Linux
# or
.\setup.ps1       # Windows (PowerShell)
```

## Available Scripts

All scripts can be run from the root directory using `pnpm <script>`:

### Development

- `pnpm dev` - Start both frontend and backend in parallel
- `pnpm dev:frontend` - Start frontend dev server only (Vite)
- `pnpm dev:server` - Start backend with Docker Compose

### Building

- `pnpm build` - Build frontend for production
- `pnpm build:frontend` - Same as above

### Docker

- `pnpm docker:up` - Start all Docker services in background
- `pnpm docker:down` - Stop all Docker services
- `pnpm docker:logs` - Follow logs from all services
- `pnpm docker:restart` - Restart all services
- `pnpm docker:rebuild` - Rebuild and restart all services

### Backend/Server

- `pnpm server:logs` - Follow FastAPI server logs
- `pnpm server:shell` - Open bash shell in FastAPI container

### Database

- `pnpm db:migrate` - Run database migrations
- `pnpm db:revision` - Create new migration (requires message)

### API Documentation

- `pnpm docs` - Show OpenAPI docs URL
- `pnpm docs:open` - Open Swagger UI in browser
- `pnpm swagger` - Open Swagger UI in browser
- `pnpm redoc` - Open ReDoc in browser
- `pnpm openapi` - Download OpenAPI spec to `openapi.json`

### Testing & Linting

- `pnpm test:frontend` - Run frontend tests
- `pnpm lint:frontend` - Lint frontend code
- `pnpm format` - Format frontend code

### Utilities

- `pnpm clean` - Clean all build artifacts and Docker volumes
- `pnpm install:all` - Install dependencies for all packages

The setup script will:

1. Install Ollama and pull a model
2. Ask for your database URL (with instructions for free Supabase/Neon setup)
3. Configure your node (electricity rate, name, optional services)
4. Build and start the Docker services
5. Start a Cloudflare tunnel and give you a public URL
6. Tell you exactly how to deploy the frontend to Vercel

Total time: ~10 minutes, no prior knowledge needed.

## Manual setup

If you prefer to set things up yourself:

### 2. Install Ollama

If you have a GPU, install Ollama natively for best performance:

```bash
# macOS
brew install ollama && brew services start ollama

# Linux
curl -fsSL https://ollama.com/install.sh | sh

# Pull your models
ollama pull qwen2.5:14b
```

### 3. Start the server

```bash
docker compose up -d
```

This starts:

- `fastapi` on `localhost:8000`
- `render-worker` polling the job queue

Ollama runs natively on the host and is reached via `host.docker.internal:11434`.

### 4. Expose your server

**Quick start (no domain needed):**

```bash
cloudflared tunnel --url http://localhost:8000
```

This gives you a free `https://xxx-yyy-zzz.trycloudflare.com` URL instantly. No account required. The URL changes each restart.

**With your own domain:**

```bash
brew install cloudflared   # or: apt install cloudflared
cloudflared tunnel login
cloudflared tunnel create gpu-node
cloudflared tunnel route dns gpu-node gpu.yourdomain.com
cloudflared tunnel token gpu-node
# Copy the token into .env as TUNNEL_TOKEN
cloudflared tunnel run gpu-node
```

### 5. Deploy the frontend

Connect the repo to Vercel. Set the root directory to `packages/frontend` and add one environment variable:

```
VITE_API_URL=https://gpu.yourdomain.com
```

Or use the `trycloudflare.com` URL from step 4 if you don't have a domain.

### 5. Point Stripe webhooks

In the Stripe dashboard, add a webhook endpoint:

```
https://your-vercel-app.vercel.app/api/webhooks/stripe
```

Events needed: `invoice.paid`, `invoice.payment_failed`, `checkout.session.completed`

---

## Configuration

All config lives in `.env`. See [ARCHITECTURE.md](./ARCHITECTURE.md#8-configuration-reference) for the full reference. Key values to set:

```env
# Your electricity rate drives all cost calculations
ELECTRICITY_RATE_KWH=0.346   # e.g. 34.6c/kWh in Wellington

# Measured GPU wattage (use a smart plug for accuracy)
GPU_INFERENCE_WATTS=150
GPU_RENDER_WATTS=300
SYSTEM_WATTS=80

# Access control
INVITE_ONLY=true
REQUIRE_APPROVAL=true
ADMIN_EMAIL=you@example.com
```

## Billing model

Costs are calculated in real time from your electricity rate and GPU wattage — no hardcoded prices. Change `ELECTRICITY_RATE_KWH` and all future usage reprices automatically.

Users run a postpaid balance. They get soft warnings at $0 and -$5, and a hard block at -$20 (configurable per user). Monthly invoices are generated automatically and charged via Stripe.

## API

The inference API is OpenAI-compatible — any client that works with OpenAI's API works here without modification. Both standard (`/v1/chat/completions`) and namespaced (`/v1/inference/chat/completions`) paths are supported.

```bash
# Chat completion (standard OpenAI path)
curl https://gpu.yourdomain.com/v1/chat/completions \
  -H "Authorization: Bearer gpus_sk_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "qwen2.5:14b", "messages": [{"role": "user", "content": "Hello"}]}'

# List models
curl https://gpu.yourdomain.com/v1/models \
  -H "Authorization: Bearer gpus_sk_YOUR_API_KEY"

# Check server status (no auth required)
curl https://gpu.yourdomain.com/v1/status
```

Render jobs, account management, and admin endpoints are documented in [ARCHITECTURE.md](./ARCHITECTURE.md#6-api-reference).

## Build order

If you're building from scratch, the recommended sequence is:

| Phase | What                                                    | Est. effort |
| ----- | ------------------------------------------------------- | ----------- |
| 1     | DB schema, FastAPI skeleton, JWT auth                   | 4–6 hrs     |
| 2     | Ollama proxy, token counting, ledger writes             | 3–4 hrs     |
| 3     | Stripe top-up, monthly invoices, webhooks               | 4–5 hrs     |
| 4     | R2 storage, render job submission, Blender worker       | 6–8 hrs     |
| 5     | Chat UI, Render UI, Account dashboard                   | 4–6 hrs     |
| 6     | Admin dashboard, email notifications, file sanitisation | 3–4 hrs     |

> Build phases 1–3 first. The billing foundation is the hardest thing to retrofit — every other feature depends on it.

## Security notes

- `.blend` files are sanitised before queuing (embedded Python scripts stripped)
- API keys are stored as bcrypt hashes only — shown once on creation
- Ollama is never exposed through the tunnel (localhost only)
- All traffic enters via Cloudflare Tunnel — no open ports required

See [ARCHITECTURE.md](./ARCHITECTURE.md#7-security) for full security details.

## License

MIT
