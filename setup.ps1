#Requires -Version 5.1
<#
.SYNOPSIS
    GPU Node  Interactive setup script for Windows.

.DESCRIPTION
    Checks prerequisites (Docker, Ollama), collects configuration,
    writes .env, builds containers, runs migrations, and optionally
    starts a Cloudflare Tunnel.  This is the Windows equivalent of
    setup.sh.
#>
$ErrorActionPreference = "Stop"

# =============================================================================
# Helper functions
# =============================================================================

function Write-Info  ([string]$msg) { Write-Host "[INFO]  " -ForegroundColor Cyan   -NoNewline; Write-Host $msg }
function Write-OK    ([string]$msg) { Write-Host "[OK]    " -ForegroundColor Green  -NoNewline; Write-Host $msg }
function Write-Warn  ([string]$msg) { Write-Host "[WARN]  " -ForegroundColor Yellow -NoNewline; Write-Host $msg }
function Write-Fail  ([string]$msg) { Write-Host "[ERROR] " -ForegroundColor Red    -NoNewline; Write-Host $msg; exit 1 }

function Read-Default ([string]$prompt, [string]$default) {
    $value = Read-Host "$prompt [$default]"
    if ([string]::IsNullOrWhiteSpace($value)) { return $default }
    return $value.Trim()
}

function Confirm ([string]$prompt) {
    $answer = Read-Host "$prompt (y/N)"
    return ($answer -eq 'y' -or $answer -eq 'Y')
}

# =============================================================================
# Step 1  Banner
# =============================================================================

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  GPU Node  Self-hosted GPU compute sharing platform"       -ForegroundColor Cyan
Write-Host "  Windows Setup"                                              -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Info "This script will walk you through setting up your GPU Node."
Write-Host ""

# =============================================================================
# Step 2  Prerequisites
# =============================================================================

Write-Host "--- Prerequisites ---" -ForegroundColor White
Write-Host ""

# Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Fail "Docker is not installed. Get Docker Desktop from https://docker.com/products/docker-desktop"
}
Write-OK "Docker found."

# Docker Compose (v2, bundled with Docker Desktop)
try {
    $composeVer = docker compose version 2>&1
    Write-OK "Docker Compose found: $composeVer"
} catch {
    Write-Fail "Docker Compose not available. Make sure Docker Desktop is up to date."
}

# Docker daemon running
try {
    docker info *> $null
    Write-OK "Docker daemon is running."
} catch {
    Write-Fail "Docker daemon is not running. Start Docker Desktop and try again."
}

Write-Host ""

# =============================================================================
# Step 3  Ollama
# =============================================================================

Write-Host "--- Ollama ---" -ForegroundColor White
Write-Host ""

if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    Write-Warn "Ollama is not installed."
    if (Confirm "Install Ollama via winget?") {
        Write-Info "Running: winget install Ollama.Ollama"
        winget install Ollama.Ollama --accept-source-agreements --accept-package-agreements
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "winget install failed. Download manually from https://ollama.com/download"
        }
        # Refresh PATH so we can find ollama
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                     [System.Environment]::GetEnvironmentVariable("Path", "User")
    } else {
        Write-Info "Please install Ollama from https://ollama.com/download and re-run this script."
        exit 0
    }
}
Write-OK "Ollama found."

# Check if Ollama is running
try {
    Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 3 | Out-Null
    Write-OK "Ollama is running."
} catch {
    Write-Warn "Ollama is not responding on http://localhost:11434."
    Write-Info "Please start the Ollama application (look for the llama icon in the system tray) and press Enter."
    Read-Host "Press Enter when Ollama is running"
    try {
        Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 5 | Out-Null
        Write-OK "Ollama is now running."
    } catch {
        Write-Fail "Still cannot reach Ollama. Make sure it is running and try again."
    }
}

Write-Host ""

# =============================================================================
# Step 4  Pull model
# =============================================================================

Write-Host "--- AI Model ---" -ForegroundColor White
Write-Host ""

$defaultModel = "qwen2.5:14b"
$model = Read-Default "Which Ollama model to pull?" $defaultModel

Write-Info "Pulling $model  this may take a while on first run..."
ollama pull $model
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Failed to pull model '$model'. Check the model name and try again."
}
Write-OK "Model '$model' is ready."

$extraModels = Read-Default "Additional models (comma-separated, or leave blank)" ""
$allModels = $model
if (-not [string]::IsNullOrWhiteSpace($extraModels)) {
    foreach ($m in ($extraModels -split ",")) {
        $m = $m.Trim()
        if ($m) {
            Write-Info "Pulling $m..."
            ollama pull $m
            if ($LASTEXITCODE -ne 0) {
                Write-Warn "Failed to pull '$m'  skipping."
            } else {
                Write-OK "Model '$m' is ready."
            }
        }
    }
    $allModels = "$model,$extraModels"
}

Write-Host ""

# =============================================================================
# Step 5  Database URL
# =============================================================================

Write-Host "--- Database ---" -ForegroundColor White
Write-Host ""

Write-Info "GPU Node requires a PostgreSQL database (Neon or Supabase recommended)."
Write-Info "The connection string should use the asyncpg driver:"
Write-Host "  postgresql+asyncpg://user:pass@host:5432/dbname" -ForegroundColor DarkGray
Write-Host ""

$databaseUrl = Read-Host "DATABASE_URL"
if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
    Write-Fail "DATABASE_URL is required."
}
Write-OK "Database URL set."

Write-Host ""

# =============================================================================
# Step 6  Configuration
# =============================================================================

Write-Host "--- Configuration ---" -ForegroundColor White
Write-Host ""

# Generate a secure random JWT secret
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
$jwtSecret = ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""

Write-OK "Generated JWT_SECRET."

$nodeName     = Read-Default "Node name"                          "My GPU Node"
$adminEmail   = Read-Default "Admin email"                        "admin@localhost"
$electricRate = Read-Default "Electricity rate per kWh (NZD)"     "0.346"
$currency     = Read-Default "Currency"                           "NZD"
$gpuInfWatts  = Read-Default "GPU inference wattage"              "150"
$gpuRndWatts  = Read-Default "GPU render wattage"                 "300"
$sysWatts     = Read-Default "System idle wattage"                "80"
$inviteOnly   = Read-Default "Invite-only signups? (true/false)"  "true"

Write-Host ""

# =============================================================================
# Step 7  Optional services
# =============================================================================

Write-Host "--- Optional Services ---" -ForegroundColor White
Write-Host ""

$services = @("inference")

if (Confirm "Enable 3D render service (requires Blender in Docker)?") {
    $services += "render"
    Write-OK "Render service enabled."
} else {
    Write-Info "Render service disabled."
}

$servicesEnabled = $services -join ","

# Stripe
$stripeSecret  = ""
$stripeWebhook = ""
if (Confirm "Configure Stripe billing?") {
    $stripeSecret  = Read-Host "STRIPE_SECRET_KEY"
    $stripeWebhook = Read-Host "STRIPE_WEBHOOK_SECRET"
    Write-OK "Stripe configured."
}

# Cloudflare R2
$r2AccountId  = ""
$r2AccessKey  = ""
$r2SecretKey  = ""
$r2Bucket     = "gpu-node-files"
if (Confirm "Configure Cloudflare R2 storage (needed for render service)?") {
    $r2AccountId = Read-Host "CLOUDFLARE_R2_ACCOUNT_ID"
    $r2AccessKey = Read-Host "CLOUDFLARE_R2_ACCESS_KEY_ID"
    $r2SecretKey = Read-Host "CLOUDFLARE_R2_SECRET_ACCESS_KEY"
    $r2Bucket    = Read-Default "CLOUDFLARE_R2_BUCKET" "gpu-node-files"
    Write-OK "R2 configured."
}

# Resend
$resendKey = ""
if (Confirm "Configure Resend email?") {
    $resendKey = Read-Host "RESEND_API_KEY"
    Write-OK "Resend configured."
}

# Tunnel token
$tunnelToken = ""
if (Confirm "Do you have a Cloudflare Tunnel token?") {
    $tunnelToken = Read-Host "TUNNEL_TOKEN"
    Write-OK "Tunnel token set."
}

Write-Host ""

# =============================================================================
# Step 8  Write .env
# =============================================================================

Write-Host "--- Writing .env ---" -ForegroundColor White
Write-Host ""

$envPath = Join-Path $PSScriptRoot ".env"

# Inside Docker, Ollama on the host is reached via host.docker.internal
$ollamaHost = "http://host.docker.internal:11434"

$envContent = @"
# =============================================================================
# GPU Node  Generated by setup.ps1 on $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
# =============================================================================

#  Required 
DATABASE_URL=$databaseUrl
JWT_SECRET=$jwtSecret
ADMIN_EMAIL=$adminEmail

#  Optional integrations 
STRIPE_SECRET_KEY=$stripeSecret
STRIPE_WEBHOOK_SECRET=$stripeWebhook
CLOUDFLARE_R2_ACCOUNT_ID=$r2AccountId
CLOUDFLARE_R2_ACCESS_KEY_ID=$r2AccessKey
CLOUDFLARE_R2_SECRET_ACCESS_KEY=$r2SecretKey
CLOUDFLARE_R2_BUCKET=$r2Bucket
RESEND_API_KEY=$resendKey

#  Services & compute 
SERVICES_ENABLED=$servicesEnabled
MODELS=$allModels
OLLAMA_HOST=$ollamaHost
OLLAMA_KEEP_ALIVE=15m
BLENDER_PATH=/usr/bin/blender
BLENDER_MAX_CONCURRENT_JOBS=1

#  Billing 
ELECTRICITY_RATE_KWH=$electricRate
CURRENCY=$currency
GPU_INFERENCE_WATTS=$gpuInfWatts
GPU_RENDER_WATTS=$gpuRndWatts
SYSTEM_WATTS=$sysWatts
BILLING_ENABLED=true
SOFT_LIMIT_WARN=-5.00
HARD_LIMIT_DEFAULT=-20.00
INVOICE_DAY=1

#  Signup & access 
INVITE_ONLY=$inviteOnly
REQUIRE_APPROVAL=true
NODE_NAME=$nodeName

#  Cloudflare Tunnel 
TUNNEL_TOKEN=$tunnelToken
"@

Set-Content -Path $envPath -Value $envContent -Encoding UTF8
Write-OK "Wrote $envPath"

Write-Host ""

# =============================================================================
# Step 9  Build and migrate
# =============================================================================

Write-Host "--- Build & Migrate ---" -ForegroundColor White
Write-Host ""

Write-Info "Building Docker images..."
docker compose build
if ($LASTEXITCODE -ne 0) { Write-Fail "Docker build failed." }
Write-OK "Images built."

Write-Info "Running database migrations..."
docker compose run --rm fastapi alembic upgrade head
if ($LASTEXITCODE -ne 0) { Write-Fail "Database migration failed." }
Write-OK "Migrations complete."

Write-Host ""

# =============================================================================
# Step 10  Start services
# =============================================================================

Write-Host "--- Starting Services ---" -ForegroundColor White
Write-Host ""

Write-Info "Starting GPU Node..."
docker compose up -d
if ($LASTEXITCODE -ne 0) { Write-Fail "docker compose up failed." }

Write-Info "Waiting for server to start..."
Start-Sleep -Seconds 3

try {
    $health = Invoke-RestMethod -Uri "http://localhost:8000/health" -TimeoutSec 5
    Write-OK "Server is running!"
} catch {
    Write-Warn "Server may still be starting. Check: docker compose logs fastapi"
}

Write-Host ""

# =============================================================================
# Step 11  Cloudflare Tunnel (quick tunnel, no account needed)
# =============================================================================

Write-Host "--- Cloudflare Tunnel ---" -ForegroundColor White
Write-Host ""

if (-not [string]::IsNullOrWhiteSpace($tunnelToken)) {
    Write-Info "You provided a TUNNEL_TOKEN  start the tunnel with:"
    Write-Host "  docker compose --profile tunnel up -d" -ForegroundColor DarkGray
} elseif (Confirm "Start a free Cloudflare quick-tunnel? (no account needed)") {
    if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
        Write-Warn "cloudflared is not installed."
        if (Confirm "Install cloudflared via winget?") {
            winget install Cloudflare.cloudflared --accept-source-agreements --accept-package-agreements
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                         [System.Environment]::GetEnvironmentVariable("Path", "User")
        } else {
            Write-Info "Install from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
            Write-Info "Skipping tunnel setup."
        }
    }

    if (Get-Command cloudflared -ErrorAction SilentlyContinue) {
        $tunnelLog = Join-Path $env:TEMP "gpu-node-tunnel.log"
        Write-Info "Starting cloudflared tunnel..."
        Start-Process cloudflared `
            -ArgumentList "tunnel", "--url", "http://localhost:8000" `
            -RedirectStandardError $tunnelLog `
            -NoNewWindow

        $tunnelUrl = $null
        for ($i = 0; $i -lt 15; $i++) {
            Start-Sleep -Seconds 1
            if (Test-Path $tunnelLog) {
                $match = Select-String -Path $tunnelLog -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" | Select-Object -First 1
                if ($match) {
                    $tunnelUrl = ($match.Matches[0].Value)
                    break
                }
            }
        }

        if ($tunnelUrl) {
            Write-OK "Tunnel active: $tunnelUrl"
        } else {
            Write-Warn "Could not detect tunnel URL. Check log: $tunnelLog"
        }
    }
} else {
    Write-Info "Skipping tunnel setup."
}

Write-Host ""

# =============================================================================
# Step 12  Summary
# =============================================================================

Write-Host "============================================================" -ForegroundColor Green
Write-Host "  GPU Node is ready!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Info "Local server:   http://localhost:8000"
Write-Info "API docs:       http://localhost:8000/docs"
if ($tunnelUrl) {
    Write-Info "Public URL:     $tunnelUrl"
}
Write-Info "Services:       $servicesEnabled"
Write-Info "Models:         $allModels"
Write-Host ""
Write-Host "Useful commands:" -ForegroundColor White
Write-Host "  docker compose logs -f          # follow all logs"          -ForegroundColor DarkGray
Write-Host "  docker compose logs fastapi     # API server logs"          -ForegroundColor DarkGray
Write-Host "  docker compose restart          # restart all services"     -ForegroundColor DarkGray
Write-Host "  docker compose down             # stop everything"          -ForegroundColor DarkGray
Write-Host ""
