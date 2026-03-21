#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────
# GPU Node Setup Script
# Works on Linux and macOS. Gets you from zero to running.
# ──────────────────────────────────────────────────────────────

# ── Helper functions ──────────────────────────────────────────

info()  { printf "\033[1;34m[INFO]\033[0m  %s\n" "$*"; }
success() { printf "\033[1;32m[OK]\033[0m    %s\n" "$*"; }
warn()  { printf "\033[1;33m[WARN]\033[0m  %s\n" "$*"; }
fail()  { printf "\033[1;31m[ERROR]\033[0m %s\n" "$*"; exit 1; }

prompt_default() {
  local prompt="$1" default="$2" varname="$3"
  read -rp "$prompt [$default]: " value
  eval "$varname=\${value:-$default}"
}

confirm() {
  local prompt="$1"
  read -rp "$prompt (y/N): " answer
  [[ "${answer,,}" == "y" ]]
}

# ── Step 1: Banner ───────────────────────────────────────────

cat << 'BANNER'

   ██████  ██████  ██    ██     ███    ██  ██████  ██████  ███████
  ██       ██   ██ ██    ██     ████   ██ ██    ██ ██   ██ ██
  ██   ███ ██████  ██    ██     ██ ██  ██ ██    ██ ██   ██ █████
  ██    ██ ██      ██    ██     ██  ██ ██ ██    ██ ██   ██ ██
   ██████  ██       ██████      ██   ████  ██████  ██████  ███████

BANNER

echo "  This script sets up everything you need to run GPU Node:"
echo "  Docker containers, Ollama, database, and optional services."
echo ""

# ── Step 2: Check Prerequisites ──────────────────────────────

info "Checking prerequisites..."

command -v docker &>/dev/null \
  || fail "Docker is not installed. Get it at https://docs.docker.com/get-docker/"

docker compose version &>/dev/null \
  || fail "Docker Compose (v2) is required. Update Docker or install the compose plugin."

docker info &>/dev/null \
  || fail "Docker daemon is not running. Start Docker Desktop (or systemctl start docker) and try again."

success "Docker is ready."

# ── Step 3: Install Ollama ───────────────────────────────────

info "Checking for Ollama..."

if ! command -v ollama &>/dev/null; then
  warn "Ollama is not installed."
  OS="$(uname -s)"

  if [[ "$OS" == "Darwin" ]]; then
    if command -v brew &>/dev/null; then
      if confirm "Install Ollama via Homebrew?"; then
        brew install ollama
      else
        fail "Install Ollama manually from https://ollama.com and re-run this script."
      fi
    else
      fail "Install Ollama from https://ollama.com (or install Homebrew first) and re-run this script."
    fi
  elif [[ "$OS" == "Linux" ]]; then
    if confirm "Install Ollama via the official install script?"; then
      curl -fsSL https://ollama.com/install.sh | sh
    else
      fail "Install Ollama manually from https://ollama.com and re-run this script."
    fi
  else
    fail "Unsupported OS: $OS. Install Ollama from https://ollama.com and re-run."
  fi
fi

# Make sure Ollama is running
if ! ollama list &>/dev/null 2>&1; then
  info "Starting Ollama in the background..."
  ollama serve &>/dev/null &
  sleep 3
fi

if curl -sf http://localhost:11434/api/tags > /dev/null; then
  success "Ollama is running."
else
  fail "Cannot reach Ollama at localhost:11434. Start it manually (ollama serve) and re-run."
fi

# ── Step 4: Pull Model ──────────────────────────────────────

echo ""
info "Choose a model to pull."
echo "  Default: qwen2.5:14b  (recommended, needs ~10 GB VRAM)"
echo "  Alternative: llama3.1:8b  (lighter, needs ~6 GB VRAM)"
echo ""

prompt_default "Model" "qwen2.5:14b" MODEL

info "Pulling $MODEL (this may take a while)..."
ollama pull "$MODEL"
success "Model $MODEL is ready."

# ── Step 5: Database URL ─────────────────────────────────────

echo ""
info "You need a Postgres database. Two free options:"
cat << 'DB_HELP'

  Supabase (supabase.com):
    1. Create a project
    2. Go to Settings -> Database -> Connection string -> URI (Session mode)
    3. Replace [YOUR-PASSWORD] with your DB password
    4. Change postgresql:// to postgresql+asyncpg://

  Neon (neon.tech):
    1. Create a project
    2. Copy the connection string
    3. Change postgresql:// to postgresql+asyncpg://

DB_HELP

read -rp "DATABASE_URL: " DATABASE_URL

if [[ ! "$DATABASE_URL" == postgresql* ]]; then
  fail "DATABASE_URL must start with 'postgresql'. Did you forget the prefix?"
fi

success "Database URL accepted."

# ── Step 6: Configuration ───────────────────────────────────

echo ""
info "Generating configuration..."

JWT_SECRET="$(openssl rand -hex 32)"
info "JWT secret generated."

prompt_default "Admin email" "admin@localhost" ADMIN_EMAIL
prompt_default "Node name" "My GPU Node" NODE_NAME

echo ""
echo "  Electricity cost is used to estimate running costs."
prompt_default "Electricity rate per kWh (in local currency)" "0.346" ELECTRICITY_RATE_KWH
prompt_default "Currency code" "NZD" CURRENCY

success "Core configuration complete."

# ── Step 7: Optional Services ────────────────────────────────

echo ""
info "Optional services (all default to disabled):"
echo ""

# Stripe billing
BILLING_ENABLED=false
STRIPE_SECRET_KEY=""
STRIPE_WEBHOOK_SECRET=""

if confirm "Enable billing via Stripe?"; then
  BILLING_ENABLED=true
  read -rp "  STRIPE_SECRET_KEY: " STRIPE_SECRET_KEY
  read -rp "  STRIPE_WEBHOOK_SECRET: " STRIPE_WEBHOOK_SECRET
  success "Stripe billing configured."
fi

# 3D rendering
SERVICES_ENABLED="inference"
R2_ACCOUNT_ID=""
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""

if confirm "Enable 3D rendering? (requires Cloudflare R2 for file storage)"; then
  SERVICES_ENABLED="inference,render"
  read -rp "  R2 Account ID: " R2_ACCOUNT_ID
  read -rp "  R2 Access Key ID: " R2_ACCESS_KEY_ID
  read -rp "  R2 Secret Access Key: " R2_SECRET_ACCESS_KEY
  success "3D rendering configured."
fi

# Email notifications
RESEND_API_KEY=""

if confirm "Enable email notifications via Resend?"; then
  read -rp "  RESEND_API_KEY: " RESEND_API_KEY
  success "Email notifications configured."
fi

# Tapo smart plug
TAPO_EMAIL=""
TAPO_PASSWORD=""
TAPO_DEVICE_IP=""

if confirm "Do you have a Tapo P110 smart plug for real-time energy monitoring?"; then
  echo "  Enter your TP-Link/Tapo account credentials and plug's local IP."
  read -rp "  TAPO_EMAIL: " TAPO_EMAIL
  read -rp "  TAPO_PASSWORD: " TAPO_PASSWORD
  read -rp "  TAPO_DEVICE_IP (e.g. 192.168.1.50): " TAPO_DEVICE_IP
  success "Tapo smart plug configured."
fi

# ── Step 8: Write .env ──────────────────────────────────────

echo ""

if [[ -f .env ]]; then
  warn ".env file already exists."
  if ! confirm "Overwrite it?"; then
    fail "Aborting. Rename or remove the existing .env and re-run."
  fi
fi

info "Writing .env file..."

cat <<EOF > .env
# ── GPU Node Configuration ────────────────────────────────
# Generated by setup.sh on $(date -u +"%Y-%m-%d %H:%M:%S UTC")

# Core
DATABASE_URL=${DATABASE_URL}
JWT_SECRET=${JWT_SECRET}
ADMIN_EMAIL=${ADMIN_EMAIL}

# Node
NODE_NAME=${NODE_NAME}
ELECTRICITY_RATE_KWH=${ELECTRICITY_RATE_KWH}
CURRENCY=${CURRENCY}

# Ollama
OLLAMA_HOST=http://host.docker.internal:11434

# Services
SERVICES_ENABLED=${SERVICES_ENABLED}

# Stripe Billing
BILLING_ENABLED=${BILLING_ENABLED}
STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}

# Cloudflare R2 (3D rendering file storage)
CLOUDFLARE_R2_ACCOUNT_ID=${R2_ACCOUNT_ID}
CLOUDFLARE_R2_ACCESS_KEY_ID=${R2_ACCESS_KEY_ID}
CLOUDFLARE_R2_SECRET_ACCESS_KEY=${R2_SECRET_ACCESS_KEY}

# Email (Resend)
RESEND_API_KEY=${RESEND_API_KEY}

# Tapo Smart Plug (energy monitoring)
TAPO_EMAIL=${TAPO_EMAIL}
TAPO_PASSWORD=${TAPO_PASSWORD}
TAPO_DEVICE_IP=${TAPO_DEVICE_IP}
EOF

success ".env written."

# ── Step 9: Build and Migrate ────────────────────────────────

echo ""
info "Building Docker images (this may take a few minutes)..."
docker compose build

info "Running database migrations..."
docker compose run --rm fastapi alembic upgrade head
success "Database is up to date."

# ── Step 10: Start Services ──────────────────────────────────

info "Starting services..."
docker compose up -d
sleep 3

if curl -sf http://localhost:8000/health > /dev/null; then
  success "Server is running!"
else
  warn "Server may still be starting. Check: docker compose logs fastapi"
fi

# ── Step 11: Cloudflare Tunnel ───────────────────────────────

echo ""
TUNNEL_URL="not started"

if ! command -v cloudflared &>/dev/null; then
  warn "cloudflared is not installed."
  OS="$(uname -s)"
  if [[ "$OS" == "Darwin" ]] && command -v brew &>/dev/null; then
    if confirm "Install cloudflared via Homebrew?"; then
      brew install cloudflared
    fi
  elif [[ "$OS" == "Linux" ]]; then
    if confirm "Install cloudflared via apt?"; then
      curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
      echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" \
        | sudo tee /etc/apt/sources.list.d/cloudflared.list
      sudo apt-get update && sudo apt-get install -y cloudflared
    fi
  fi
fi

if command -v cloudflared &>/dev/null; then
  if confirm "Start a Cloudflare tunnel to expose your server?"; then
    info "Starting tunnel..."
    cloudflared tunnel --url http://localhost:8000 &> /tmp/gpu-node-tunnel.log &

    # Wait for the tunnel URL to appear in the log
    for i in $(seq 1 15); do
      if url=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/gpu-node-tunnel.log 2>/dev/null | head -1); then
        if [[ -n "$url" ]]; then
          TUNNEL_URL="$url"
          break
        fi
      fi
      sleep 1
    done

    if [[ "$TUNNEL_URL" == "not started" ]]; then
      warn "Tunnel started but URL not yet available. Check /tmp/gpu-node-tunnel.log"
    else
      success "Tunnel active at $TUNNEL_URL"
    fi
  fi
fi

# ── Step 12: Summary ─────────────────────────────────────────

# Determine services list for display
SERVICES_DISPLAY="inference"
[[ "$SERVICES_ENABLED" == *"render"* ]] && SERVICES_DISPLAY="inference, render"

# Determine billing status
BILLING_DISPLAY="disabled"
[[ "$BILLING_ENABLED" == "true" ]] && BILLING_DISPLAY="enabled"

echo ""
echo "══════════════════════════════════════════"
echo "  GPU Node is running!"
echo "══════════════════════════════════════════"
echo ""
echo "  Local:     http://localhost:8000"
echo "  Tunnel:    $TUNNEL_URL"
echo "  Services:  $SERVICES_DISPLAY"
echo "  Model:     $MODEL"
echo "  Billing:   $BILLING_DISPLAY"
echo ""
echo "  Next steps:"
echo ""
echo "  1. Deploy the frontend to Vercel:"
echo "     -> Import this repo at vercel.com/new"
echo "     -> Set root directory to: packages/frontend"
echo "     -> Add environment variable:"
echo "        VITE_API_URL = $TUNNEL_URL"
echo ""
echo "  2. Create your admin account:"
echo "     -> Open the frontend and sign up"
echo "     -> First user automatically becomes admin"
echo ""
echo "  3. For a permanent URL, set up a Cloudflare Tunnel"
echo "     with your own domain. See README.md for details."
echo ""

if [[ "$TUNNEL_URL" != "not started" ]]; then
  echo "  Warning: The trycloudflare.com URL changes each restart."
  echo "     Re-run: cloudflared tunnel --url http://localhost:8000"
  echo ""
fi

echo "══════════════════════════════════════════"
echo ""
