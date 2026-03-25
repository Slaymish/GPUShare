# Changelog

All notable changes to GPUShare are documented here.

---

## [Unreleased]

### Features
- **OpenAI-compatible tool/function calling** — full passthrough of `tools`, `tool_choice`, `tool_calls`, and `tool_call_id` for both Ollama and OpenRouter backends, enabling structured JSON tool execution in clients like OpenCode

### Infrastructure & Deployment
- Added Cloudflared ingress config to fix 503 errors for all requests
- Added FastAPI healthcheck and made Cloudflared wait for healthy origin before routing traffic
- Refactored Docker Compose to support host Ollama with optional GPU override
- Added MIT License

### Integrations
- Added OpenCode integration with auto-routing model support

### Bug Fixes
- Fixed CORS policy errors from `gpu-share.vercel.app`
- Fixed models outputting raw XML `<tool_call>` tags instead of using native JSON function calling

---

## Core Features

### AI Model Support
- **OpenRouter integration** — access to cloud AI models with optional billing
- **Ollama (local models)** — local model loading with indicator pill, message queue, and friendly offline error messages
- **OpenClaw integration** — custom provider config with lobster logo
- **Multi-step model picker wizard** — live backend recommendations with fallback to static data, pricing display weighted 3:1 input/output tokens for realistic cost estimates
- **Vision/multimodal support** — file attachment support for images and text files; models tagged with `vision_support` flag to filter attachments by capability

### Chat Interface
- Markdown rendering for assistant messages with syntax highlighting
- Collapsible desktop sidebar with localStorage persistence
- Improved mobile chat header with title display and fixed input positioning
- Replaced mobile bottom tab bar with cleaner sidebar navigation
- Mobile sidebar replaced with dropdown menu in header
- Friendly error messages for OpenRouter API failures (status-specific guidance)
- Friendly error shown when server is offline

### Themes & UI
- Theme switcher with default/light/dark palettes, persisted to backend
- Radix UI component library added
- PWA support with mobile-optimized UI and haptic feedback
- Fixed horizontal overflow and improved mobile layout responsiveness
- Disabled mobile zoom

### Authentication & Users
- Bootstrap token required for initial admin signup
- Hardened signup invite enforcement
- Guest/demo mode with limited access to free cloud models only
- Profile editing and password reset functionality
- Password reset token and expiry fields added via Alembic migration
- Proper Pydantic schemas for profile update and password reset endpoints

### Billing & Payments
- Stripe integration for payment method management (modal dialog UI)
- Postpaid billing support with debt tracking and negative balance handling
- Postpaid billing info section with invoice schedule
- Billing gated behind both billing and Stripe flags being enabled
- Total balance display and billing fixes

### Invite & Access Control
- Invite system with API key generation
- OpenAI-compatible endpoints

### Admin & Server Management
- `gpushare-admin` skill for server management through OpenClaw
- Admin endpoint updates
- Rate limiting on server

### Monitoring & Integrations
- Server status monitoring and integration health dashboard
- Tapo P110 smart plug integration for real-time energy monitoring

### Developer Experience
- `pnpm` workspace configuration with comprehensive script commands
- npm scripts for syncing Alembic migrations from Docker to local filesystem
- Dynamic CSP generation based on `API_URL` environment variable
- Content Security Policy for Stripe integration
- Automated setup scripts (`setup.sh`, `setup.ps1`) with simplified deployment instructions
- Comprehensive `.env.example` with inline comments
- Loading cards and skeleton states
- Stripe conditionally loaded only when publishable key is present
- localStorage image data stripped with quota-exceeded fallback

---

## Refactoring & Maintenance
- Simplified Alembic `env.py` to use `DATABASE_URL` directly with initial migration
- Replaced PEP 604 union syntax with explicit `Optional`/`List` type hints for broader Python compatibility
- Added `future` annotations import across Python modules
- Reformatted `ModelPickerModal`, `api.ts`, and `account.tsx` for consistent code style
- Removed unused imports and simplified type casting
- Comprehensive `.gitignore` entries for `node_modules` in pnpm workspaces
- Replaced unicode escape sequences with literal characters
