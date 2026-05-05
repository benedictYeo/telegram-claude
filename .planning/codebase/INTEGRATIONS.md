# External Integrations

**Analysis Date:** 2026-05-05

## Current State

The project is at Phase 1 completion (echo bot with auth). Most integrations are planned but not yet implemented. This document covers both current and planned integrations with their implementation status.

## APIs & External Services

### Telegram Bot API (ACTIVE - Phase 1)

- **Purpose:** Primary user interface - receive messages and send responses
- **SDK/Client:** Raw `fetch` calls (no library, per project convention)
- **Base URL:** `https://api.telegram.org` (constant in `src/core/telegram.ts`)
- **Auth:** Bot token via `TELEGRAM_BOT_TOKEN` secret, passed in URL path (`/bot{token}/...`)
- **Webhook secret:** `TELEGRAM_WEBHOOK_SECRET` - verified via `X-Telegram-Bot-Api-Secret-Token` header in `src/core/auth.ts`

**Endpoints used:**
| Method | Endpoint | File | Status |
|--------|----------|------|--------|
| POST | `/bot{token}/sendMessage` | `src/core/telegram.ts` | Active |
| POST | `/bot{token}/sendChatAction` | `src/core/telegram.ts` | Active |
| POST | `/bot{token}/setWebhook` | Manual curl (one-time setup) | Manual |
| GET | `/bot{token}/getWebhookInfo` | Manual curl (verification) | Manual |

**Webhook inbound:**
- Telegram POSTs updates to `POST /webhook` on the Worker
- Signature verified in `src/core/auth.ts:checkWebhookSignature()`
- User ID verified in `src/core/auth.ts:checkUserAllowed()`
- Parse mode: HTML only (never MarkdownV2)
- Message chunking at 4000 chars (safety margin under 4096 API limit)

### Anthropic Messages API (PLANNED - Phase 2)

- **Purpose:** LLM inference for all bot responses
- **SDK/Client:** `@anthropic-ai/sdk` (to be installed)
- **Auth:** `ANTHROPIC_API_KEY` secret
- **Model:** `claude-sonnet-4-6` (or latest at build time)
- **Max tokens:** 4096
- **Planned file:** `src/core/claude.ts`
- **Pattern:** Ack-and-defer - return 200 immediately, call Claude in `ctx.waitUntil()`, send result via Telegram

### Anthropic MCP Servers (PLANNED - Phase 4)

- **Purpose:** Tool use via Model Context Protocol for external service access
- **Implementation:** `mcp_servers[]` parameter in Anthropic Messages API call
- **Planned file:** `src/core/mcp.ts`
- **May require:** `anthropic-beta` header (check docs at build time)

**Planned MCP servers:**

| Server | URL | Auth | Phase |
|--------|-----|------|-------|
| Notion | `https://mcp.notion.com/mcp` | `NOTION_TOKEN` bearer | Phase 4 |
| Telegram | Custom MCP URL | Bot token | Phase 4 |
| Supabase | Custom MCP URL | `SUPABASE_ACCESS_TOKEN` | Phase 4 |
| Gmail | Google MCP | Google OAuth access token | Phase 7 |
| Calendar | Google MCP | Google OAuth access token | Phase 7 |
| Drive | Google MCP | Google OAuth access token | Phase 7 |

## Data Storage

### Workers KV (PLANNED - Phase 3+)

**Namespaces:**

| Namespace | Binding | Purpose | TTL | Phase |
|-----------|---------|---------|-----|-------|
| `CONV` | `env.CONV` | Conversation state (message history) | 24h (`expirationTtl: 86400`) | Phase 3 |
| `OAUTH` | `env.OAUTH` | Google OAuth refresh tokens | No TTL (encrypted at rest) | Phase 7 |

- **Key pattern (CONV):** `chat:{chat_id}` - JSON array of `{role, content}` message turns
- **Key pattern (OAUTH):** `google:{user_id}` - Refresh token storage
- **Consistency:** Eventually consistent globally (acceptable for conversation state)
- **Planned files:** `src/state/conversation.ts`, `src/state/oauth.ts`
- **Bindings typed in:** `src/types.ts` (lines 10-11) - `CONV: KVNamespace`, `OAUTH: KVNamespace`

**File Storage:**
- Not applicable - text-only bot (v1 non-goal: no file generation)

**Caching:**
- KV used for update_id dedup cache (Phase 8, 5min TTL)
- KV used for Google access token caching (Phase 7, TTL = expires_in - 60s)
- KV used for daily token usage counter (Phase 8)

## Authentication & Identity

### Telegram Webhook Authentication (ACTIVE)
- **Implementation:** `src/core/auth.ts:checkWebhookSignature()`
- Header `X-Telegram-Bot-Api-Secret-Token` must match `TELEGRAM_WEBHOOK_SECRET`
- Mismatch returns `401 "unauthorized"`

### User ID Allowlist (ACTIVE)
- **Implementation:** `src/core/auth.ts:checkUserAllowed()`
- Checks `update.message.from.id` or `update.callback_query.from.id` against `ALLOWED_USER_ID` string
- Mismatch returns `200 "ok"` (silent drop, no error, no echo, no log)

### External Webhook Auth (PLANNED - Phase 6)
- `/hook/:source?key=WEBHOOK_SECRET` - query parameter auth
- Secret: `WEBHOOK_SECRET` env var

### Google OAuth 2.0 (PLANNED - Phase 7)
- **Provider:** Google (GCP project)
- **Flow:** Authorization code flow
- **Routes:** `GET /oauth/google/start` (redirect to consent), `GET /oauth/google/callback` (exchange code)
- **Secrets:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- **Token storage:** Refresh token in `OAUTH` KV, access token cached with TTL
- **Scopes:** Gmail API, Calendar API, Drive API
- **Planned file:** `src/state/oauth.ts`

## Monitoring & Observability

**Error Tracking:**
- Cloudflare Workers built-in observability (enabled in `wrangler.toml`)
- Planned: error rate alert > 5% via Cloudflare dashboard (Phase 8)

**Logs:**
- `wrangler tail` for live log streaming
- Structured logs for cron fires, MCP tool names, error types (Phase 8)
- **Hard rule:** Never log message content, MCP responses, or user payloads

## CI/CD & Deployment

**Hosting:**
- Cloudflare Workers
- URL pattern: `https://tg-claude.<subdomain>.workers.dev`
- `workers_dev = true` enables `*.workers.dev` subdomain

**CI Pipeline:**
- None configured (no GitHub Actions, no CI/CD files detected)
- Manual deploy via `npx wrangler deploy`

**Deployment commands:**
```bash
npx wrangler deploy              # Deploy worker
npx wrangler secret put <NAME>   # Set secret
npx wrangler kv namespace create <NAME>  # Create KV namespace
npx wrangler tail                # Live log tail
```

## Environment Configuration

**Required secrets (set via `wrangler secret put`):**

| Secret | Source | Required Phase |
|--------|--------|---------------|
| `TELEGRAM_BOT_TOKEN` | @BotFather | Phase 1 |
| `TELEGRAM_WEBHOOK_SECRET` | `openssl rand -hex 32` | Phase 1 |
| `ALLOWED_USER_ID` | Telegram `/getUpdates` API | Phase 1 |
| `ANTHROPIC_API_KEY` | console.anthropic.com | Phase 2 |
| `WEBHOOK_SECRET` | `openssl rand -hex 32` | Phase 6 |
| `NOTION_TOKEN` | Notion internal integration | Phase 4 |
| `SUPABASE_URL` | Supabase project settings | Phase 4 |
| `SUPABASE_ACCESS_TOKEN` | Supabase project settings | Phase 4 |
| `GOOGLE_CLIENT_ID` | GCP console | Phase 7 |
| `GOOGLE_CLIENT_SECRET` | GCP console | Phase 7 |

**Secrets location:**
- Production: Cloudflare Workers secrets (encrypted at rest)
- Development: `.dev.vars` file (gitignored)
- Never in `wrangler.toml`, `.env`, or source code

## Webhooks & Callbacks

**Incoming (Telegram -> Worker):**
- `POST /webhook` - Telegram bot updates (messages, callback queries)
- Registered via `setWebhook` API call with `secret_token` parameter

**Incoming (External -> Worker, PLANNED Phase 6):**
- `POST /hook/:source?key=...` - Generic external webhook ingress
- Sources: GitHub (issue/PR/push events), generic (JSON pretty-print)
- Optional Claude summarization for payloads >2000 chars

**Incoming (Google -> Worker, PLANNED Phase 7):**
- `GET /oauth/google/callback` - OAuth authorization code exchange

**Outgoing (Worker -> Telegram):**
- `sendMessage` - Bot responses to user
- `sendChatAction` - Typing indicator
- All via raw `fetch` to `https://api.telegram.org/bot{token}/...`

**Outgoing (Worker -> Anthropic, PLANNED Phase 2+):**
- Messages API calls with conversation history
- MCP server connections via `mcp_servers[]` parameter

## Integration Patterns

**All external API calls use raw `fetch`** - no HTTP client libraries. This is a hard project convention.

**Ack-and-defer pattern for webhook processing:**
1. Receive Telegram POST at `/webhook`
2. Verify auth (signature + user ID)
3. Return `200 "ok"` immediately
4. Process via `ctx.waitUntil()`: call Claude, send response via Telegram
5. Telegram never times out (60s webhook limit)

**Error handling for integrations:**
- Generic error message to user: icon + short text (e.g. `something failed`)
- Log error type only (no payloads, no stack traces)
- Always return 200 to Telegram (non-200 causes retries)

---

*Integration audit: 2026-05-05*
