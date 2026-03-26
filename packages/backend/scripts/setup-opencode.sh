#!/usr/bin/env bash
# Setup script for OpenCode with GPUShare
# Usage: curl -fsSL https://your-site.com/setup-opencode.sh | bash -s -- --key "YOUR_KEY" --url "https://your-site.com"

set -euo pipefail

API_KEY=""
API_URL=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --key) API_KEY="$2"; shift 2 ;;
        --url) API_URL="$2"; shift 2 ;;
        *) shift ;;
    esac
done

if [ -z "$API_KEY" ]; then
    echo "Error: API key required."
    echo "Usage: curl -fsSL <url>/setup-opencode.sh | bash -s -- --key YOUR_KEY --url https://your-gpushare.com"
    exit 1
fi

if [ -z "$API_URL" ]; then
    echo "Error: --url is required (e.g., --url https://your-gpushare-instance.com)"
    exit 1
fi

# Strip trailing slash from URL
API_URL="${API_URL%/}"

# Install OpenCode if missing
if ! command -v opencode &> /dev/null; then
    echo "Installing OpenCode..."
    curl -fsSL https://opencode.ai/install | bash
fi

# Resolve OS-specific config directory (matches Go's os.UserConfigDir())
case "$(uname -s)" in
    Darwin) CONF_DIR="$HOME/Library/Application Support/opencode" ;;
    *)      CONF_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode" ;;
esac

mkdir -p "$CONF_DIR"

cat > "$CONF_DIR/config.json" <<EOF
{
  "provider": {
    "gpushare": {
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "${API_URL}/v1",
        "apiKey": "${API_KEY}"
      }
    }
  },
  "model": "gpushare/auto"
}
EOF

echo "OpenCode configured with GPUShare!"
echo "  Model: gpushare/auto (smart routing)"
echo "  API:   ${API_URL}/v1"
echo "  Config: ${CONF_DIR}/config.json"
echo ""
echo "Run 'opencode' in any project folder to start."
echo "Tip: Type /models inside OpenCode to switch models."
