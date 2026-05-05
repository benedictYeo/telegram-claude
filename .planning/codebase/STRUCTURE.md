# Codebase Structure

**Analysis Date:** 2026-05-05

## Directory Layout

```
telegram-claude/
├── src/                    # All application source code
│   ├── index.ts            # Worker entry point (fetch + scheduled)
│   ├── types.ts            # Shared TypeScript interfaces (Env, Telegram types)
│   ├── core/               # Reusable business logic and API wrappers
│   │   ├── auth.ts         # Webhook signature check + user ID allowlist
│   │   └── telegram.ts     # Telegram Bot API client (sendMessage, chatAction, chunking)
│   └── handlers/           # Per-trigger request handlers
│       └── telegram.ts     # POST /webhook handler
├── test/                   # Unit tests (separate from source)
│   ├── auth.test.ts        # Auth function tests
│   └── chunking.test.ts    # Message chunking tests
├── wrangler.toml           # Cloudflare Worker config
├── package.json            # Dependencies and scripts
├── tsconfig.json           # TypeScript config (strict, ES2022)
├── vitest.config.ts        # Test runner config
├── .gitignore              # Excludes node_modules, .env*, .wrangler, dist, .dev.vars
├── CLAUDE.md               # Claude Code operating instructions
├── PLAN.md                 # Project strategy, architecture, phases
└── TASKS.md                # Execution checklist (source of truth for build order)
```

## Directory Purposes

**`src/`:**
- Purpose: All application TypeScript source
- Contains: Worker entry, type definitions, and subdirectories per layer
- Key files: `src/index.ts` (entry), `src/types.ts` (shared interfaces)

**`src/core/`:**
- Purpose: Reusable logic shared across handlers — API clients, auth, utilities
- Contains: Pure functions and API wrapper modules
- Key files: `src/core/auth.ts`, `src/core/telegram.ts`
- Planned additions: `src/core/claude.ts` (Phase 2), `src/core/mcp.ts` (Phase 4)

**`src/handlers/`:**
- Purpose: One file per trigger type — receives external input, orchestrates core calls
- Contains: Handler functions that are called from `src/index.ts` routing
- Key files: `src/handlers/telegram.ts`
- Planned additions: `src/handlers/cron.ts` (Phase 5), `src/handlers/webhook.ts` (Phase 6)

**`src/state/` (planned, Phase 3+):**
- Purpose: KV read/write operations for persistent state
- Will contain: `conversation.ts` (chat history CRUD with 24h TTL), `oauth.ts` (Google token refresh)

**`src/tasks/` (planned, Phase 5):**
- Purpose: Cron task implementations (prompt builders for scheduled briefs)
- Will contain: `morning-brief.ts`, `digest.ts`

**`test/`:**
- Purpose: Unit tests, separate from source (not co-located)
- Contains: `.test.ts` files mirroring core module names
- Key files: `test/auth.test.ts`, `test/chunking.test.ts`
- Planned additions: `test/handler.test.ts`, `test/telegram.test.ts`

## Key File Locations

**Entry Points:**
- `src/index.ts`: Worker default export with `fetch()` and `scheduled()` handlers
- `wrangler.toml`: Declares `main = "src/index.ts"` as the Worker entry

**Configuration:**
- `wrangler.toml`: Worker name (`tg-claude`), compatibility date, observability settings, KV bindings (planned)
- `tsconfig.json`: TypeScript strict mode, ES2022 target, `@cloudflare/workers-types`
- `vitest.config.ts`: Test runner using `node` environment
- `package.json`: Dev dependencies only (no runtime deps yet), npm scripts

**Core Logic:**
- `src/core/auth.ts`: `checkWebhookSignature()`, `checkUserAllowed()`
- `src/core/telegram.ts`: `tgSend()`, `tgSendChatAction()`, `chunkMessage()`
- `src/handlers/telegram.ts`: `handleTelegramWebhook()` — full request lifecycle

**Type Definitions:**
- `src/types.ts`: `Env` (all secrets + KV bindings), `TgUser`, `TgChat`, `TgMessage`, `TgCallbackQuery`, `TgUpdate`

**Testing:**
- `test/auth.test.ts`: Signature and user checks
- `test/chunking.test.ts`: Message splitting edge cases

**Documentation:**
- `CLAUDE.md`: Operating conventions for Claude Code (do's, don'ts, commit format)
- `PLAN.md`: Full project plan with architecture, phases, security model
- `TASKS.md`: Phase-by-phase checklist with acceptance criteria

## Naming Conventions

**Files:**
- `kebab-case.ts` for all source and test files (e.g., `morning-brief.ts`)
- Handler files named after their trigger type (e.g., `telegram.ts`, `cron.ts`, `webhook.ts`)
- Test files use `.test.ts` suffix (e.g., `auth.test.ts`, `chunking.test.ts`)
- Config files at root level (e.g., `wrangler.toml`, `tsconfig.json`, `vitest.config.ts`)

**Directories:**
- `src/core/`: Reusable modules (auth, API clients)
- `src/handlers/`: Per-trigger handlers
- `src/state/`: Persistence layer (planned)
- `src/tasks/`: Cron job implementations (planned)
- `test/`: All tests in flat directory

**Functions:**
- camelCase: `checkWebhookSignature`, `checkUserAllowed`, `tgSend`, `chunkMessage`
- Telegram functions prefixed with `tg`: `tgSend`, `tgSendChatAction`
- Handler functions prefixed with `handle`: `handleTelegramWebhook`
- Builder functions prefixed with `build`: `buildMcpServers` (planned)

**Types:**
- PascalCase with `Tg` prefix for Telegram types: `TgUser`, `TgChat`, `TgMessage`, `TgUpdate`
- `Env` interface for Worker bindings (no prefix)

**Exports:**
- Named exports only — no default exports except the Worker entry (`src/index.ts`)
- Each module exports individual functions, not classes

## Where to Add New Code

**New Handler (e.g., cron, external webhook):**
- Create handler file: `src/handlers/{trigger-name}.ts`
- Export a function: `handle{TriggerName}(req, env, ctx)` or `handle{TriggerName}(event, env)`
- Wire routing in `src/index.ts` (add URL path match or scheduled dispatch)
- Add tests: `test/{trigger-name}.test.ts`

**New Core Module (e.g., Claude client, MCP config):**
- Create module file: `src/core/{module-name}.ts`
- Export pure functions or async API wrappers
- Import from handlers via `../core/{module-name}.js`
- Add unit tests: `test/{module-name}.test.ts`

**New State Module (e.g., conversation, OAuth):**
- Create module file: `src/state/{module-name}.ts`
- Functions take `env: Env` as first param to access KV namespaces
- Always include `expirationTtl: 86400` on `CONV` KV writes
- Add unit tests: `test/{module-name}.test.ts`

**New Cron Task:**
- Create task file: `src/tasks/{task-name}.ts`
- Export an async function that takes `env: Env`
- Wire from cron handler (`src/handlers/cron.ts`) by matching `event.cron` string
- Optionally add a manual trigger command (e.g., `/brief` -> morning brief)

**New Telegram Type:**
- Add interface to `src/types.ts` with `Tg` prefix
- Only define fields the bot actually uses (not full Telegram API)

**New Secret/Binding:**
- Add to `Env` interface in `src/types.ts`
- Store via `wrangler secret put` (never in code or config files)
- If KV namespace: add `[[kv_namespaces]]` block to `wrangler.toml`

**New npm Script:**
- Add to `package.json` `scripts` section
- Current scripts: `test` (vitest run), `test:watch` (vitest), `typecheck` (tsc)

## Special Directories

**`node_modules/`:**
- Purpose: npm dependencies
- Generated: Yes (via `npm install`)
- Committed: No (in `.gitignore`)

**`.wrangler/`:**
- Purpose: Wrangler local state and build cache
- Generated: Yes (by wrangler CLI)
- Committed: No (in `.gitignore`)

**`dist/`:**
- Purpose: Build output (if any)
- Generated: Yes
- Committed: No (in `.gitignore`)

**`.planning/`:**
- Purpose: GSD planning and codebase analysis documents
- Generated: By tooling
- Committed: Check `.gitignore` — not currently excluded

## Import Path Convention

All internal imports use `.js` extension (required by ES module resolution with bundler):
```typescript
import type { Env } from "../types.js";
import { checkWebhookSignature } from "../core/auth.js";
```

No path aliases configured. All imports use relative paths.

---

*Structure analysis: 2026-05-05*
