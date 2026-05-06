# CLAUDE.md — Project Context for Claude Code

Personal AI orchestration layer running on Cloudflare Workers. Telegram is the only interface.

## Read first
1. `PLAN.md` — strategy, architecture, security model.
2. `TASKS.md` — granular execution checklist. Source of truth for what to build next.
3. This file — operating conventions while working in the repo.

## Owner
Ben — Singapore. Top-down thinker. Wants short, structured responses. Tools first, results, stop. No filler.

## How to work in this repo

**Always:**
- Check `TASKS.md` to find current phase. Tick boxes as you complete tasks.
- One phase at a time. Stop at phase boundary for manual smoke test.
- One commit per logical task group (~3-7 ticked boxes).
- Commit message format: `feat(phase-N): <what shipped>` or `fix(phase-N): <what>`.

**Never:**
- Skip phases or pull tasks forward.
- Add libraries that don't earn their weight (no `node-telegram-bot-api`, no `axios`, etc — use raw `fetch`).
- Log message content, MCP responses, or any user payload.
- Echo input on auth failure (silent drop only).
- Bypass the ack-and-defer pattern, even for "fast" calls.
- Put secrets in code, `wrangler.toml`, or `.env` (use `wrangler secret put`).

## Stack constraints

- Cloudflare Workers (Paid plan, $5/mo)
- TypeScript strict mode
- Wrangler 4.x
- Workers KV for state
- Anthropic Messages API + MCP servers
- Telegram Bot API (raw `fetch`, no library)
- Vitest with `@cloudflare/vitest-pool-workers`

## Hard rules

1. Every KV write to `CONV` must include `expirationTtl: 86400`.
2. Auth gate at top of every handler. Return 401 on bad signature, silent 200 drop on bad user.
3. Telegram webhook returns within 60s — always `ctx.waitUntil` for Claude calls.
4. HTML parse mode for Telegram, never MarkdownV2.
5. Chunk Telegram messages at 4000 chars (safety margin under 4096).
6. Errors to user: generic icon + short message (`⚠️ something failed`). Real error logged by type only.
7. No `update_id` reprocessing — idempotency via KV cache (Phase 8).

## Communication style when responding to Ben

Mirror his style: short 3–6 word sentences. Direct answers. Tools first, show results, stop. No narration. No filler words (the, is, am, are dropped where natural). When asking clarifying questions, prefer interactive options over prose questions.

## When stuck

- If a Cloudflare or Anthropic API behavior is unclear, search current docs (don't rely on training).
- If a phase's acceptance criterion can't be met, stop and ask Ben — don't paper over.
- If you find yourself reaching for a heavy dependency, propose it first with rationale.

## Out of scope (v1)

See `PLAN.md` §2 (Non-goals) and `TASKS.md` Backlog. Do not pull these in without a written decision.

<!-- GSD:project-start source:PROJECT.md -->
## Project

**Telegram Claude Orchestrator**

A personal AI orchestration layer running on a Mac mini, accessible exclusively via Telegram. An always-on agent that manages a second brain (Obsidian vault), orchestrates external services (Google, GitHub), runs scheduled tasks, and supports extensible skills — inspired by OpenClaw and Hermes. Model-flexible: can use Claude, OpenAI, or local models on UNRAID.

**Core Value:** Always-accessible AI assistant that can read/write my second brain and orchestrate services on my behalf — from anywhere, via Telegram.

### Constraints

- **Runtime**: Mac mini (always-on), exposed via Tailscale Funnel — no port forwarding
- **Language**: Polyglot — TypeScript for Telegram bot/orchestration core, Python for AI/ML integrations and local model support
- **Auth**: Single user only — Ben's Telegram user ID
- **Obsidian access**: Direct filesystem access on Mac mini (Obsidian Sync has no API)
- **Security**: No content logging. Secrets in env vars or secret manager, never in code.
- **Interface**: Telegram only. HTML parse mode, never MarkdownV2.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript (strict mode) - All source and test code (`src/**/*.ts`, `test/**/*.ts`)
- TOML - Cloudflare Worker configuration (`wrangler.toml`)
## Runtime
- Cloudflare Workers (Paid plan, $5/mo) - V8 isolate runtime, not Node.js
- Compatibility date: `2025-01-01` (set in `wrangler.toml`)
- `ExecutionContext` with `waitUntil()` for deferred async work (requires Paid plan)
- npm
- Lockfile: `package-lock.json` present (lockfileVersion 3)
- Required: 20.x or higher (for wrangler, vitest, tsc)
## Frameworks
- Cloudflare Workers (no framework) - Raw `fetch` handler in `src/index.ts`
- No HTTP framework (no Hono, no itty-router) - manual URL/method routing
- Vitest `^4.1.4` - Test runner
- `@cloudflare/vitest-pool-workers` `^0.14.7` - Worker-aware test pool (installed but vitest config currently uses `environment: "node"`)
- Wrangler `^4.83.0` - Cloudflare CLI for dev, deploy, secrets, KV management
- TypeScript `^6.0.2` - Type checking only (`noEmit: true`), bundling handled by Wrangler
## Key Dependencies
| Package | Version | Purpose |
|---------|---------|---------|
| `wrangler` | `^4.83.0` | Cloudflare Workers CLI (dev server, deploy, secrets, KV) |
| `typescript` | `^6.0.2` | Type checking (`npx tsc` / `npm run typecheck`) |
| `@cloudflare/workers-types` | `^4.20260416.2` | Type definitions for Workers runtime APIs (KVNamespace, ExecutionContext, etc.) |
| `vitest` | `^4.1.4` | Test runner |
| `@cloudflare/vitest-pool-workers` | `^0.14.7` | Miniflare-backed test pool for integration tests |
- `@anthropic-ai/sdk` - Anthropic Messages API client (Phase 2)
- No `node-telegram-bot-api` or similar Telegram libraries - use raw `fetch`
- No `axios` - use native `fetch`
- No HTTP router libraries - manual routing in `src/index.ts`
## Configuration
- Target: ES2022
- Module: ES2022 with bundler resolution
- Strict mode enabled
- `noEmit: true` (Wrangler handles bundling)
- Types: `@cloudflare/workers-types` only
- Includes: `src/**/*.ts`, `test/**/*.ts`
- Worker name: `tg-claude`
- Entry point: `src/index.ts`
- `workers_dev = true` (accessible at `*.workers.dev`)
- Observability enabled
- No KV namespace bindings yet (added in Phase 3)
- No cron triggers yet (added in Phase 5)
- Environment: `node` (not using `@cloudflare/vitest-pool-workers` pool yet)
- No coverage configuration
- `TELEGRAM_BOT_TOKEN` - Telegram Bot API identity
- `TELEGRAM_WEBHOOK_SECRET` - Webhook signature verification
- `ALLOWED_USER_ID` - Single-user allowlist
- `ANTHROPIC_API_KEY` - LLM API access (Phase 2+)
- `WEBHOOK_SECRET` - External webhook ingress auth (Phase 6+)
- `.dev.vars` file (gitignored) for local secrets
- `wrangler dev` for local Worker runtime
## Build & Run Commands
## Platform Requirements
- Node.js 20.x+
- npm
- Wrangler 4.x (`npm install -g wrangler` or use `npx`)
- `wrangler login` for Cloudflare auth
- Cloudflare Workers Paid plan ($5/mo) - required for `waitUntil()` and cron triggers
- Workers KV namespaces: `CONV` (conversation state, 24h TTL), `OAUTH` (Google tokens, no TTL)
- Secrets stored via `wrangler secret put`
- 30s CPU time limit per request (Workers Paid)
- 128MB memory limit
- No filesystem access
- No long-running processes - must use `ctx.waitUntil()` for async work after response
- `fetch` is the only HTTP client available
- KV is eventually consistent (fine for conversation state, not for locks)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- Lowercase kebab-style is NOT used. Files use single lowercase words: `auth.ts`, `telegram.ts`, `types.ts`
- Test files mirror source file name with `.test.ts` suffix: `auth.test.ts`, `chunking.test.ts`
- One module per file. No barrel/index re-exports within subdirectories.
- camelCase for all functions: `checkWebhookSignature`, `checkUserAllowed`, `handleTelegramWebhook`, `chunkMessage`, `tgSend`
- Prefix pattern by domain: `tg` prefix for Telegram API calls (`tgSend`, `tgSendChatAction`), `check` prefix for auth guards (`checkWebhookSignature`, `checkUserAllowed`), `handle` prefix for request handlers (`handleTelegramWebhook`)
- camelCase: `chatId`, `fromId`, `parseMode`
- UPPER_SNAKE_CASE for module-level constants: `TG_API`, `MAX_CHUNK`
- PascalCase with domain prefix: `TgUser`, `TgChat`, `TgMessage`, `TgUpdate`, `TgCallbackQuery`
- `Tg` prefix for Telegram domain types, `Env` for the worker environment binding
- All types defined in `src/types.ts` as a central type registry
## Code Style
- No Prettier or ESLint configured. Formatting is manual/editor-based.
- 2-space indentation observed across all files
- Double quotes for strings (consistent across all source and test files)
- Semicolons always used
- Trailing commas in multi-line constructs (object literals, function parameters)
- No ESLint, Biome, or other linter configured
- TypeScript strict mode (`"strict": true` in `tsconfig.json`) serves as the primary static analysis tool
- Type checking via `npm run typecheck` (runs `tsc`)
- Strict mode is mandatory (`tsconfig.json` line 8)
- Target ES2022, module ES2022, bundler module resolution
- Use `type` keyword for type-only imports: `import type { Env } from "./types.js"`
- Unused parameters prefixed with underscore: `_ctx`, `_event`, `_env`
## Import Organization
- Relative paths with `.js` extension: `"./types.js"`, `"../core/auth.js"`, `"../types.js"`
- Always include `.js` extension on local imports (required for ES module bundler resolution)
- No path aliases configured (no `paths` in tsconfig)
## Error Handling
- Auth failures return early with appropriate HTTP status. Signature failures get `401`; unauthorized users get silent `200` (drop, no error message)
- JSON parse failures are caught and silently return `200` (see `src/handlers/telegram.ts` lines 14-18)
- Never expose error details to users. CLAUDE.md rule: generic icon + short message (`something failed`), real error logged by type only
- Use `Response | null` return pattern for guard functions: `null` means "passed", non-null `Response` means "failed" (see `src/core/auth.ts` `checkWebhookSignature`)
- Never echo user input on auth failure (CLAUDE.md hard rule)
- Return `new Response("ok")` for non-error drops (bad user, missing message)
- Return `new Response("not found", { status: 404 })` for unknown routes
- Return `new Response("unauthorized", { status: 401 })` for signature failures
## Logging
- Cloudflare Workers Observability is enabled (`wrangler.toml` `[observability] enabled = true`)
- No `console.log` calls in source code. Intentionally minimal logging.
- CLAUDE.md hard rule: never log message content, MCP responses, or user payloads
- Errors logged by type only, never content
## Comments
- Sparingly. Only for non-obvious behavior or future-phase stubs
- Phase stubs use `// Stub -- [purpose] wired in Phase N` pattern (see `src/index.ts` line 20)
- Security-critical silence uses explanatory comment: `// Silent drop -- no log, no error` (see `src/handlers/telegram.ts` line 22)
- Not used. No JSDoc comments anywhere in the codebase.
## Function Design
- `env: Env` is the first or second parameter on nearly every function (worker binding pattern)
- Use default parameter values where sensible: `parseMode = "HTML"`, `max = MAX_CHUNK`
- Unused parameters prefixed with `_`: `_ctx: ExecutionContext`
- Guard functions return `Response | null` (null = pass)
- Boolean check functions return `boolean` directly
- Async API call functions return `Promise<void>` (fire-and-forget pattern)
- Handler functions return `Promise<Response>`
## Module Design
- Named exports only. No default exports except the Worker entry point (`src/index.ts` `export default { ... }`)
- Each module exports only what is needed by other modules
- Not used. No `index.ts` re-export files in subdirectories.
## Dependency Philosophy
- `node-telegram-bot-api` -- use raw `fetch` instead
- `axios` -- use raw `fetch` instead
- Any Telegram bot framework
- `@cloudflare/vitest-pool-workers` - test pool
- `@cloudflare/workers-types` - type definitions
- `typescript` - compiler
- `vitest` - test runner
- `wrangler` - Cloudflare CLI
## Telegram-Specific Conventions
- Always use HTML parse mode, never MarkdownV2 (CLAUDE.md hard rule)
- Chunk messages at 4000 chars (safety margin under Telegram's 4096 limit)
- Use raw `fetch` for all Telegram API calls (no SDK)
- Telegram API base URL stored as module constant: `const TG_API = "https://api.telegram.org"`
- Bot token interpolated in URL path: `` `${TG_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage` ``
## KV Conventions
- Every KV write to `CONV` namespace must include `expirationTtl: 86400` (CLAUDE.md hard rule)
- KV namespaces typed in `Env` interface: `CONV: KVNamespace`, `OAUTH: KVNamespace`
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## System Overview
```text
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
- Single Cloudflare Worker handles all ingress (webhook, cron, external hooks)
- Three-layer architecture: Handlers -> Core -> External APIs
- Auth gate runs at the top of every handler before any processing
- No external libraries for Telegram API calls (raw `fetch` only)
- Ack-and-defer pattern planned for Phase 2 (`ctx.waitUntil` for long-running calls)
## Layers
- Purpose: Receive external triggers, validate input, orchestrate core calls
- Location: `src/handlers/`
- Contains: One handler file per trigger type (telegram, cron, webhook)
- Depends on: Core layer (`src/core/`)
- Used by: Worker entry point (`src/index.ts`)
- Currently implemented: `src/handlers/telegram.ts`
- Planned: `src/handlers/cron.ts` (Phase 5), `src/handlers/webhook.ts` (Phase 6)
- Purpose: Reusable business logic, API wrappers, auth checks
- Location: `src/core/`
- Contains: Auth utilities, Telegram API client, Claude API client (planned), MCP config (planned)
- Depends on: External APIs (Telegram, Anthropic), types
- Used by: Handlers layer
- Currently implemented: `src/core/auth.ts`, `src/core/telegram.ts`
- Planned: `src/core/claude.ts` (Phase 2), `src/core/mcp.ts` (Phase 4)
- Purpose: KV read/write for conversation history and OAuth tokens
- Location: `src/state/` (not yet created)
- Contains: Conversation state management, OAuth token refresh
- Depends on: Workers KV (`CONV`, `OAUTH` namespaces)
- Used by: Handlers layer
- Planned: `src/state/conversation.ts` (Phase 3), `src/state/oauth.ts` (Phase 7)
- Purpose: Cron-triggered task implementations
- Location: `src/tasks/` (not yet created)
- Contains: Morning brief, evening digest prompt builders
- Depends on: Core layer (Claude, Telegram)
- Used by: Cron handler
- Planned: `src/tasks/morning-brief.ts`, `src/tasks/digest.ts` (Phase 5)
- Purpose: Shared TypeScript interfaces for the entire codebase
- Location: `src/types.ts`
- Contains: `Env` interface (all Worker bindings), Telegram update types (`TgUser`, `TgChat`, `TgMessage`, `TgCallbackQuery`, `TgUpdate`)
- Used by: All layers
## Data Flow
### Primary Request Path (Telegram Webhook)
### Planned: Ack-and-Defer Path (Phase 2+)
### Health Check
- Currently: Stateless echo bot (no persistence)
- Planned: Workers KV `CONV` namespace stores conversation history per `chat:{chat_id}` key with 24h TTL
- Planned: Workers KV `OAUTH` namespace stores Google refresh tokens with no TTL
## Key Abstractions
- Purpose: Type-safe access to all Worker bindings (secrets + KV namespaces)
- Definition: `src/types.ts:1-12`
- Pattern: Passed as parameter to every function that needs secrets or KV access
- Purpose: Typed representation of Telegram Bot API webhook payloads
- Definition: `src/types.ts:14-45`
- Pattern: Manual interface definitions (no Telegram SDK), only types needed by the bot are defined
- Purpose: Early-return pattern for auth checks
- Implementation: `src/core/auth.ts:3-9`
- Pattern: `checkWebhookSignature` returns `Response` on failure (caller returns it) or `null` on success (caller continues). `checkUserAllowed` returns boolean; on false, handler silently returns `200 "ok"`.
## Entry Points
- Location: `src/index.ts:5`
- Triggers: All HTTP requests to the Worker
- Responsibilities: URL-based routing to `/webhook`, `/health`, or 404
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
### Returning Errors to Unauthorized Users
### Synchronous Claude Calls
### Using MarkdownV2 Parse Mode
## Error Handling
- Auth failures: 401 for bad signatures, silent 200 drop for unauthorized users (`src/handlers/telegram.ts:11,20-23`)
- JSON parse failures: Catch and return `200 "ok"` silently (`src/handlers/telegram.ts:14-18`)
- Missing message text: Return `200 "ok"` silently (`src/handlers/telegram.ts:27`)
- Planned (Phase 2): Claude call failures send generic error icon to user, log error type without payload
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
