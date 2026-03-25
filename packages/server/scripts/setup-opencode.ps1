# Setup script for OpenCode with GPUShare (Windows)
# Usage: irm https://your-site.com/setup-opencode.ps1 -OutFile setup.ps1; .\setup.ps1 -Key "YOUR_KEY" -Url "https://your-site.com"

param(
    [Parameter(Mandatory=$true)][string]$Key,
    [Parameter(Mandatory=$true)][string]$Url
)

# Strip trailing slash
$Url = $Url.TrimEnd('/')

# Install OpenCode if missing
if (-not (Get-Command opencode -ErrorAction SilentlyContinue)) {
    Write-Host "Installing OpenCode..."
    iex "& {$(irm https://opencode.ai/install.ps1)} "
}

# Write Config
$confPath = "$env:USERPROFILE\.config\opencode"
if (-not (Test-Path $confPath)) { New-Item -ItemType Directory -Path $confPath -Force | Out-Null }

$config = @{
    provider = @{
        gpushare = @{
            npm = "@ai-sdk/openai-compatible"
            options = @{
                baseURL = "$Url/v1"
                apiKey = $Key
            }
        }
    }
    model = "gpushare/auto"
} | ConvertTo-Json -Depth 10

$config | Out-File "$confPath\opencode.json" -Encoding utf8

Write-Host "OpenCode configured with GPUShare!" -ForegroundColor Green
Write-Host "  Model: gpushare/auto (smart routing)"
Write-Host "  API:   $Url/v1"
Write-Host ""
Write-Host "Run 'opencode' in any project folder to start."
Write-Host "Tip: Type /models inside OpenCode to switch models."
