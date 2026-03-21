---
name: gpushare
description: >
  Route inference to a friend's GPU over a private Cloudflare tunnel.
  Uses their idle NVIDIA hardware instead of cloud APIs — powered by
  local renewables, billed at electricity cost.
metadata:
  openclaw:
    emoji: "⚡"
    requires:
      env:
        - GPUSHARE_API_URL
        - GPUSHARE_API_KEY
    primaryEnv: GPUSHARE_API_KEY
---

# GPUShare

You have access to a remote GPU running local AI models via GPUShare.
Use this when the user asks to use GPUShare, or when local models are
unavailable and remote inference would help.

## Configuration

The following environment variables must be set:
- `GPUSHARE_API_URL`: The tunnel URL (e.g. https://gpu.example.com)
- `GPUSHARE_API_KEY`: Bearer token for authentication (starts with `gpus_sk_`)

## Available Actions

### Chat with a remote model
Make requests to `${GPUSHARE_API_URL}/v1/chat/completions` with:
- Header: `Authorization: Bearer ${GPUSHARE_API_KEY}`
- Standard OpenAI chat completion request body
- Supports streaming (`"stream": true`)

Example request:
```json
{
  "model": "llama3.1:8b",
  "messages": [{"role": "user", "content": "Hello!"}],
  "stream": false,
  "temperature": 0.7,
  "max_tokens": 2048
}
```

### List available models
GET `${GPUSHARE_API_URL}/v1/models` with the same Authorization header.
Returns an OpenAI-compatible model list showing local Ollama models
and any cloud models (OpenRouter) the server has configured.

### Check server status
GET `${GPUSHARE_API_URL}/v1/status` returns GPU availability,
current load, loaded models, and estimated queue time.
No authentication required for this endpoint.

## When the server is offline
The host GPU may be in use for gaming or the PC may be off. If you get
a connection error or a 503, let the user know the server is currently
unavailable and suggest they try again later or use a different model
provider.

## OpenRouter Fallback
If `OPENROUTER_API_KEY` is set in your environment and GPUShare returns
a 503 or connection error, you can fall back to OpenRouter for inference.
Use the OpenRouter API (`https://openrouter.ai/api/v1/chat/completions`)
with the same model name format. Inform the user you're using cloud
inference as fallback — it will cost more than the GPU's electricity rate.

## Cost
Inference is billed at electricity cost only (fractions of a cent per
response). The server's electricity rate is returned in the `/v1/status`
endpoint under `electricity_rate_nzd_kwh`.

## Response Headers
- `X-GPUShare-Credits-Remaining`: User's current credit balance (when billing is enabled)

## Error Handling
- **401 Unauthorized**: API key is invalid or revoked
- **402 Payment Required**: User has exceeded their spending limit
- **503 Service Unavailable**: GPU is offline or Ollama is not running
