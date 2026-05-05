<!-- refreshed: 2026-05-05 -->
# Architecture

**Analysis Date:** 2026-05-05

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                   Cloudflare Worker (single)                │
├──────────────────┬──────────────────┬───────────────────────┤
│  Telegram POST   │  Cron schedule   │  External webhook     │
│  POST /webhook   │  scheduled()     │  /hook/:source        │
│  `src/handlers/  │  (stub)          │  (planned Phase 6)    │
│   telegram.ts`   │                  │                       │
└────────┬─────────┴────────┬─────────┴──────────┬────────────┘
         │                  │                     │
         ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                      Core Layer                             │
│  `src/core/auth.ts`  `src/core/telegram.ts`                 │
│  (planned: `src/core/claude.ts`  `src/core/mcp.ts`)         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  External APIs                                              │
│  - Telegram Bot API (sendMessage, sendChatAction)           │
│  - Anthropic Messages API (planned Phase 2)                 │
│  - MCP servers (planned Phase 4)                            │
│                                                             │
│  State: Workers KV (planned Phase 3)                        │
│  `CONV` namespace (24h TTL)  `OAUTH` namespace              │
└─────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Worker entry | HTTP routing (`POST /webhook`, `GET /health`, catch-all 404) + scheduled stub | `src/index.ts` |
| Telegram handler | Parse Telegram update, run auth, dispatch response | `src/handlers/telegram.ts` |
| Auth core | Webhook signature verification + user ID allowlist | `src/core/auth.ts` |
| Telegram core | Send messages, send chat actions, chunk long text | `src/core/telegram.ts` |
| Type definitions | `Env` interface (bindings + secrets) + Telegram API types | `src/types.ts` |

## Pattern Overview

**Overall:** Single-Worker serverless with handler-per-trigger pattern

**Key Characteristics:**
- Single Cloudflare Worker handles all ingress (webhook, cron, external hooks)
- Three-layer architecture: Handlers -> Core -> External APIs
- Auth gate runs at the top of every handler before any processing
- No external libraries for Telegram API calls (raw `fetch` only)
- Ack-and-defer pattern planned for Phase 2 (`ctx.waitUntil` for long-running calls)

## Layers

**Handlers Layer (`src/handlers/`):**
- Purpose: Receive external triggers, validate input, orchestrate core calls
- Location: `src/handlers/`
- Contains: One handler file per trigger type (telegram, cron, webhook)
- Depends on: Core layer (`src/core/`)
- Used by: Worker entry point (`src/index.ts`)
- Currently implemented: `src/handlers/telegram.ts`
- Planned: `src/handlers/cron.ts` (Phase 5), `src/handlers/webhook.ts` (Phase 6)

**Core Layer (`src/core/`):**
- Purpose: Reusable business logic, API wrappers, auth checks
- Location: `src/core/`
- Contains: Auth utilities, Telegram API client, Claude API client (planned), MCP config (planned)
- Depends on: External APIs (Telegram, Anthropic), types
- Used by: Handlers layer
- Currently implemented: `src/core/auth.ts`, `src/core/telegram.ts`
- Planned: `src/core/claude.ts` (Phase 2), `src/core/mcp.ts` (Phase 4)

**State Layer (`src/state/`) — Planned:**
- Purpose: KV read/write for conversation history and OAuth tokens
- Location: `src/state/` (not yet created)
- Contains: Conversation state management, OAuth token refresh
- Depends on: Workers KV (`CONV`, `OAUTH` namespaces)
- Used by: Handlers layer
- Planned: `src/state/conversation.ts` (Phase 3), `src/state/oauth.ts` (Phase 7)

**Tasks Layer (`src/tasks/`) — Planned:**
- Purpose: Cron-triggered task implementations
- Location: `src/tasks/` (not yet created)
- Contains: Morning brief, evening digest prompt builders
- Depends on: Core layer (Claude, Telegram)
- Used by: Cron handler
- Planned: `src/tasks/morning-brief.ts`, `src/tasks/digest.ts` (Phase 5)

**Types (`src/types.ts`):**
- Purpose: Shared TypeScript interfaces for the entire codebase
- Location: `src/types.ts`
- Contains: `Env` interface (all Worker bindings), Telegram update types (`TgUser`, `TgChat`, `TgMessage`, `TgCallbackQuery`, `TgUpdate`)
- Used by: All layers

## Data Flow

### Primary Request Path (Telegram Webhook)

1. Telegram sends POST to `/webhook` -> Worker `fetch()` routes to handler (`src/index.ts:8`)
2. `handleTelegramWebhook` checks webhook signature header (`src/handlers/telegram.ts:10` -> `src/core/auth.ts:3-9`)
3. Request body parsed as `TgUpdate`, user ID checked against allowlist (`src/handlers/telegram.ts:20` -> `src/core/auth.ts:11-15`)
4. Extract message text, echo back via `tgSend` (`src/handlers/telegram.ts:31` -> `src/core/telegram.ts:15-29`)
5. Return `200 "ok"` to Telegram (`src/handlers/telegram.ts:33`)

### Planned: Ack-and-Defer Path (Phase 2+)

1. Same auth checks as above
2. Return `200 "ok"` immediately (ack)
3. `ctx.waitUntil(processMessage(...))` defers Claude call
4. Send `typing` chat action -> call Anthropic API -> chunk response -> `tgSend`
5. On error: send generic error icon to user, log error type only

### Health Check

1. GET `/health` -> returns `200 "ok"` (no auth, no info disclosure) (`src/index.ts:12-13`)

**State Management:**
- Currently: Stateless echo bot (no persistence)
- Planned: Workers KV `CONV` namespace stores conversation history per `chat:{chat_id}` key with 24h TTL
- Planned: Workers KV `OAUTH` namespace stores Google refresh tokens with no TTL

## Key Abstractions

**Env Interface:**
- Purpose: Type-safe access to all Worker bindings (secrets + KV namespaces)
- Definition: `src/types.ts:1-12`
- Pattern: Passed as parameter to every function that needs secrets or KV access

**Telegram Update Types:**
- Purpose: Typed representation of Telegram Bot API webhook payloads
- Definition: `src/types.ts:14-45`
- Pattern: Manual interface definitions (no Telegram SDK), only types needed by the bot are defined

**Auth Gate (Response | null):**
- Purpose: Early-return pattern for auth checks
- Implementation: `src/core/auth.ts:3-9`
- Pattern: `checkWebhookSignature` returns `Response` on failure (caller returns it) or `null` on success (caller continues). `checkUserAllowed` returns boolean; on false, handler silently returns `200 "ok"`.

## Entry Points

**Worker Fetch Handler:**
- Location: `src/index.ts:5`
- Triggers: All HTTP requests to the Worker
- Responsibilities: URL-based routing to `/webhook`, `/health`, or 404

**Worker Scheduled Handler:**
- Location: `src/index.ts:19`
- Triggers: Cloudflare cron triggers (planned Phase 5)
- Responsibilities: Stub only — will dispatch cron tasks

## Architectural Constraints

- **Threading:** Single-threaded V8 isolate per request (Cloudflare Workers model). No shared memory between requests. `ctx.waitUntil` extends execution beyond response but does not create threads.
- **Global state:** None. No module-level singletons or shared mutable state. All state flows through function parameters (`env`).
- **Circular imports:** None detected. Clean unidirectional dependency: `index.ts` -> `handlers/` -> `core/` -> `types.ts`.
- **Execution time:** Worker must respond within 60 seconds. Telegram retries on non-200 responses. Always ack immediately and defer long work to `ctx.waitUntil`.
- **KV consistency:** Workers KV is eventually consistent globally. Acceptable for conversation state, not suitable for locks or counters requiring strong consistency.
- **No external libraries for HTTP:** All Telegram API calls use raw `fetch`. No `node-telegram-bot-api`, no `axios`. Same expected for Anthropic (via their SDK is the one exception — `@anthropic-ai/sdk` planned for Phase 2).
- **Secrets management:** All secrets stored via `wrangler secret put`. Never in code, `wrangler.toml`, or `.env` files committed to repo.

## Anti-Patterns

### Logging Message Content

**What happens:** Logging user messages, Claude responses, or MCP tool results
**Why it's wrong:** Privacy violation. Content may contain sensitive personal data. Logs are visible in Cloudflare dashboard.
**Do this instead:** Log event types and outcomes only (e.g., "message received", "claude call succeeded"). See `src/handlers/telegram.ts:21` for the silent-drop pattern.

### Returning Errors to Unauthorized Users

**What happens:** Returning error details or echoing input when auth fails
**Why it's wrong:** Leaks information about the bot's existence and state to attackers
**Do this instead:** Return silent `200 "ok"` for user mismatch (no response, no log). Return `401` only for webhook signature mismatch. See `src/handlers/telegram.ts:20-23`.

### Synchronous Claude Calls

**What happens:** Awaiting Claude API response before returning HTTP response to Telegram
**Why it's wrong:** Telegram webhook has a 60-second timeout. Claude calls can exceed this, causing Telegram to retry and duplicate processing.
**Do this instead:** Return `200 "ok"` immediately, wrap Claude call in `ctx.waitUntil()`. Pattern defined in `PLAN.md` Section 9 "Ack-and-defer".

### Using MarkdownV2 Parse Mode

**What happens:** Setting `parse_mode: "MarkdownV2"` on Telegram messages
**Why it's wrong:** MarkdownV2 requires escaping `_*[]()~>#+\-=|{}.!` characters. Claude output will frequently contain these unescaped, causing message send failures.
**Do this instead:** Always use `parse_mode: "HTML"`. See `src/core/telegram.ts:19` where HTML is the default.

## Error Handling

**Strategy:** Fail silently to users, log error type only

**Patterns:**
- Auth failures: 401 for bad signatures, silent 200 drop for unauthorized users (`src/handlers/telegram.ts:11,20-23`)
- JSON parse failures: Catch and return `200 "ok"` silently (`src/handlers/telegram.ts:14-18`)
- Missing message text: Return `200 "ok"` silently (`src/handlers/telegram.ts:27`)
- Planned (Phase 2): Claude call failures send generic error icon to user, log error type without payload

## Cross-Cutting Concerns

**Logging:** Cloudflare Workers observability enabled in `wrangler.toml`. No content logging. Event-type-only logging planned for Phase 8.
**Validation:** Telegram webhook signature checked via header comparison. User ID checked against string-compared allowlist.
**Authentication:** Two-layer: (1) webhook secret token in HTTP header, (2) Telegram user ID allowlist. Both checked before any processing occurs.

---

*Architecture analysis: 2026-05-05*
