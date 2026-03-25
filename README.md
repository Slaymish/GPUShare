# GPUShare

![GitHub stars](https://img.shields.io/github/stars/Slaymish/GPUShare?style=social)
![License](https://img.shields.io/github/license/Slaymish/GPUShare)
![Docker](https://img.shields.io/badge/docker-ready-blue)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)

> Turn your idle gaming GPU into a private AI & rendering server for friends and family — they only pay for electricity used.

[**Demo**](#) | [**Quick Start**](#quick-start) | [**Documentation**](https://github.com/Slaymish/GPUShare/wiki) 

![GPUShare Dashboard Screenshot](screenshot.png)

## Why GPUShare?

- **🔌 Fair pricing**: Users only pay actual electricity costs — no cloud markups
- **🔒 Privacy first**: Your data never leaves the trusted group
- **⚡ Zero waste**: That RTX 4090 mining dust? Now it's serving AI models
- **🎮 Keep gaming**: Pause jobs instantly when you need your GPU back
- **💳 No vendor lock-in**: Works with Ollama, OpenRouter, standard Blender

### Who is this for?
- **Indie teams** sharing a workstation GPU for development
- **Friends** splitting the cost of AI experiments
- **Families** with one powerful PC serving everyone's needs
- **Students** pooling resources for coursework


It runs two services off your GPU:

| Service      | How                                  | Billed by          |
| ------------ | ------------------------------------ | ------------------ |
| AI Inference | Ollama (local) or OpenRouter (cloud) | Per million tokens |
| 3D Rendering | Blender job queue                    | Per render-minute  |

Costs are derived from your actual electricity rate and GPU wattage. You set `ELECTRICITY_RATE_KWH` and `GPU_INFERENCE_WATTS` in a `.env` file — all prices flow from that. No margins, no markup, no hardcoded rates.

Users get a credit balance. They top up via Stripe (or you manually adjust their balance), use inference/rendering, and get a monthly invoice for what they owe. You're not making a business out of this — you're just not subsidising other people's GPU time.


## What you need

**Hardware:** Any GPU that can run Ollama models. The bigger the VRAM, the bigger the models you can load. A 12–16GB card handles 14B parameter models comfortably.

**Software:**

- Docker + Docker Compose
- A free Postgres database — [Supabase](https://supabase.com) or [Neon](https://neon.tech) (free tier is fine)

**Optional (can add later):**

- Stripe — for card payments and invoicing
- Cloudflare R2 — for render output storage (free tier is fine)
- Resend — for email notifications
- A custom domain — or use the free `trycloudflare.com` URL

## How it fits together

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

Your machine never needs an open port. Traffic enters through a Cloudflare Tunnel — you run `cloudflared` on your machine and it maintains an outbound connection to Cloudflare's edge.

## Setup

### One-click install (easiest)

**macOS / Linux** — paste this into your terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/Slaymish/GPUShare/main/install.sh | bash
```

**Windows** — double-click `setup.bat`, or in PowerShell:

```powershell
.\setup.bat
```

**Fully silent install** (no prompts, all defaults):

```bash
./setup.sh --quick                # macOS / Linux
.\setup.ps1 -Quick                # Windows
.\setup.bat --quick               # Windows (via .bat)
```

### What the installer does

The setup script auto-detects your GPU and OS, then:

1. **Checks prerequisites** — Docker, Git, port availability
2. **Installs Ollama** — via Homebrew (macOS), winget (Windows), or official script (Linux)
3. **Recommends a model** — based on your GPU VRAM (4B for 4GB, 8B for 8GB, 14B for 16GB, 32B for 24GB+)
4. **Asks for your database URL** — with instructions for free Supabase/Neon setup
5. **Configures your node** — electricity rate, GPU wattage (auto-estimated), name
6. **Optional integrations** — Stripe billing, OpenRouter, 3D rendering, email
7. **Builds and starts Docker services** — with health checks
8. **Optionally starts a Cloudflare tunnel** — free public URL, no account needed

Total time: ~10 minutes (interactive) or ~5 minutes (--quick).

### Script options

| Flag | Description |
|------|-------------|
| `--quick` / `-Quick` | Non-interactive, use all defaults |
| `--skip-ollama` | Don't install Ollama or pull models |
| `--skip-tunnel` | Don't start Cloudflare tunnel |
| `--dry-run` | Show what would happen without executing |

### Manual setup

**1. Install Ollama**

```bash
# macOS
brew install ollama && brew services start ollama

### Manual setup

**1. Install Ollama**

```bash
# macOS
brew install ollama && brew services start ollama

# Linux
curl -fsSL https://ollama.com/install.sh | sh

ollama pull qwen2.5:14b   # or whatever model you want to serve
```

**2. Start the server**

```bash
docker compose up -d
```

This starts `fastapi` on `localhost:8000` and the render worker. Ollama runs natively on the host and is reached via `host.docker.internal:11434`.

**3. Expose your server**

```bash
# No account needed, URL changes on restart:
cloudflared tunnel --url http://localhost:8000

# Or with your own domain (persistent URL):
cloudflared tunnel login
cloudflared tunnel create gpushare
cloudflared tunnel route dns gpushare gpu.yourdomain.com
cloudflared tunnel token gpushare   # add TUNNEL_TOKEN to .env
cloudflared tunnel run gpushare
```

**4. Deploy the frontend**

Connect the repo to Vercel and set the root directory to `packages/frontend`. No environment variables needed — `vercel.json` proxies `/v1/*` and `/health` requests to your server automatically.

**5. Point Stripe webhooks (if using Stripe)**

Add a webhook endpoint in the Stripe dashboard:

```
https://your-vercel-app.vercel.app/api/webhooks/stripe
```

Events needed: `invoice.paid`, `invoice.payment_failed`, `checkout.session.completed`

## Configuration

All config lives in `.env`. Key values:

```env
# Your electricity rate drives all cost calculations
ELECTRICITY_RATE_KWH=0.346   # e.g. 34.6c/kWh in Wellington

# Measured GPU wattage (use a smart plug for accuracy)
GPU_INFERENCE_WATTS=150
GPU_RENDER_WATTS=300
SYSTEM_WATTS=80

# Access control — recommended when sharing with a small group
INVITE_ONLY=true
REQUIRE_APPROVAL=true
ADMIN_EMAIL=you@example.com
```

Change `ELECTRICITY_RATE_KWH` and all future usage reprices automatically. Past ledger entries are not touched.

## API

The inference endpoint is OpenAI-compatible — any client that works with OpenAI works here without modification:

```bash
curl https://gpu.yourdomain.com/v1/chat/completions \
  -H "Authorization: Bearer gpus_sk_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "qwen2.5:14b", "messages": [{"role": "user", "content": "Hello"}]}'
```

Both `/v1/chat/completions` and `/v1/inference/chat/completions` are supported. Models with a `/` in the ID (e.g. `anthropic/claude-3.5-sonnet`) are automatically routed through OpenRouter.

## Billing model

Users run a postpaid balance. Soft warnings at $0 and -$5, hard block at -$20 (configurable per user). Monthly invoices are generated automatically. If you're not using Stripe, you can manage balances manually through the admin panel.

## Security notes

- `.blend` files are sanitised before queuing — embedded Python scripts are stripped via headless Blender before the file is stored
- API keys are stored as bcrypt hashes only, shown once on creation
- Ollama is never exposed through the tunnel (localhost only)
- All inbound traffic enters via Cloudflare Tunnel — no open ports required on your machine

## Available scripts

```bash
pnpm dev              # frontend + backend together
pnpm docker:up        # start all Docker services
pnpm docker:logs      # follow logs
pnpm docker:rebuild   # rebuild and restart
pnpm db:migrate       # run migrations
pnpm db:revision      # create new migration
```

## Contributing

I would love help! Check out:
- [Roadmap & feature requests](https://github.com/Slaymish/GPUShare/discussions)
- [Development setup guide](CONTRIBUTING.md)

**Current priorities:**
- [ ] NVIDIA GPU monitoring dashboard
- [ ] AMD GPU support
- [ ] Automatic job scheduling
- [ ] Mobile app
- [x] One-click installer (Windows, macOS, Linux)

## License

MIT
