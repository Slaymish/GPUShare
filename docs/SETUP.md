# Self-Hosting GPUShare

GPUShare lets you share your GPU's compute (AI inference + 3D rendering) with trusted users, billed at electricity cost. This guide gets you from zero to running.

## Prerequisites

- **A machine with a GPU** — NVIDIA recommended (CUDA support for Ollama + Blender)
- **Docker** + **Docker Compose v2** — [Install Docker](https://docs.docker.com/get-docker/)
- **Ollama** — [Install Ollama](https://ollama.com) (or use the Docker-managed setup below)
- **A Postgres database** — free tier on [Neon](https://neon.tech) or [Supabase](https://supabase.com) works great

## Quick Start

The fastest way to get running:

```bash
git clone https://github.com/Slaymish/GPUShare.git
cd GPUShare
./setup.sh
```

The interactive setup script will:
1. Check and install prerequisites (Ollama, cloudflared)
2. Pull your chosen LLM model
3. Walk you through database and service configuration
4. Generate your `.env` file
5. Build Docker images and run migrations
6. Start the server and optionally open a Cloudflare Tunnel

## Manual Setup

If you prefer to configure things yourself:

### 1. Clone and configure

```bash
git clone https://github.com/Slaymish/GPUShare.git
cd GPUShare
cp .env.example .env
```

Edit `.env` with your values. The **required** settings are:

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string (use `postgresql+asyncpg://` prefix) |
| `JWT_SECRET` | Random 64-char string — generate with `openssl rand -hex 32` |
| `ADMIN_EMAIL` | Your email (first signup with this email becomes admin) |

### 2. Install and start Ollama

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model
ollama pull qwen2.5:14b
```

Or use Docker-managed Ollama with GPU passthrough (Linux + NVIDIA):
```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d
```

### 3. Build and start the server

```bash
docker compose build
docker compose run --rm fastapi alembic upgrade head   # run migrations
docker compose up -d
```

Your API server is now running at `http://localhost:8000`.

### 4. Expose with Cloudflare Tunnel

For a quick temporary URL (no account needed):
```bash
cloudflared tunnel --url http://localhost:8000
```

For a permanent URL with your own domain, set `TUNNEL_TOKEN` in `.env` and:
```bash
docker compose --profile tunnel up -d
```

### 5. Deploy the frontend

Deploy `packages/frontend` to [Vercel](https://vercel.com/new):

1. Import the repo and set **Root Directory** to `packages/frontend`
2. Deploy

No environment variables needed — `vercel.json` proxies `/v1/*` and `/health` requests to your server automatically, so CORS is handled server-side.

### 6. Create your admin account

Open the frontend, sign up with the email you set as `ADMIN_EMAIL` — you'll automatically have admin privileges.

## Optional Services

All optional — configure in `.env` as needed:

| Feature | What you need |
|---|---|
| **Billing** | [Stripe](https://stripe.com) API keys — enables credit top-ups and invoicing |
| **3D Rendering** | [Cloudflare R2](https://developers.cloudflare.com/r2/) bucket for file storage |
| **Cloud AI models** | [OpenRouter](https://openrouter.ai) API key — adds GPT-4o, Claude, etc. alongside local models |
| **Email notifications** | [Resend](https://resend.com) API key |
| **Energy monitoring** | A [Tapo P110](https://www.tapo.com/en/product/smart-plug/tapo-p110/) smart plug on the same network |

See `.env.example` for all configuration options with descriptions.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a full system overview.
