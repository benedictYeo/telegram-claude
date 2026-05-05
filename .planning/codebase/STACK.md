# Technology Stack

**Analysis Date:** 2026-05-05

## Languages

**Primary:**
- TypeScript (strict mode) - All source and test code (`src/**/*.ts`, `test/**/*.ts`)

**Secondary:**
- TOML - Cloudflare Worker configuration (`wrangler.toml`)

## Runtime

**Environment:**
- Cloudflare Workers (Paid plan, $5/mo) - V8 isolate runtime, not Node.js
- Compatibility date: `2025-01-01` (set in `wrangler.toml`)
- `ExecutionContext` with `waitUntil()` for deferred async work (requires Paid plan)

**Package Manager:**
- npm
- Lockfile: `package-lock.json` present (lockfileVersion 3)

**Node.js (development only):**
- Required: 20.x or higher (for wrangler, vitest, tsc)

## Frameworks

**Core:**
- Cloudflare Workers (no framework) - Raw `fetch` handler in `src/index.ts`
- No HTTP framework (no Hono, no itty-router) - manual URL/method routing

**Testing:**
- Vitest `^4.1.4` - Test runner
- `@cloudflare/vitest-pool-workers` `^0.14.7` - Worker-aware test pool (installed but vitest config currently uses `environment: "node"`)

**Build/Dev:**
- Wrangler `^4.83.0` - Cloudflare CLI for dev, deploy, secrets, KV management
- TypeScript `^6.0.2` - Type checking only (`noEmit: true`), bundling handled by Wrangler

## Key Dependencies

**All dependencies are devDependencies (zero production deps):**

| Package | Version | Purpose |
|---------|---------|---------|
| `wrangler` | `^4.83.0` | Cloudflare Workers CLI (dev server, deploy, secrets, KV) |
| `typescript` | `^6.0.2` | Type checking (`npx tsc` / `npm run typecheck`) |
| `@cloudflare/workers-types` | `^4.20260416.2` | Type definitions for Workers runtime APIs (KVNamespace, ExecutionContext, etc.) |
| `vitest` | `^4.1.4` | Test runner |
| `@cloudflare/vitest-pool-workers` | `^0.14.7` | Miniflare-backed test pool for integration tests |

**Planned (not yet installed):**
- `@anthropic-ai/sdk` - Anthropic Messages API client (Phase 2)

**Intentionally excluded (per CLAUDE.md):**
- No `node-telegram-bot-api` or similar Telegram libraries - use raw `fetch`
- No `axios` - use native `fetch`
- No HTTP router libraries - manual routing in `src/index.ts`

## Configuration

**TypeScript (`tsconfig.json`):**
- Target: ES2022
- Module: ES2022 with bundler resolution
- Strict mode enabled
- `noEmit: true` (Wrangler handles bundling)
- Types: `@cloudflare/workers-types` only
- Includes: `src/**/*.ts`, `test/**/*.ts`

**Wrangler (`wrangler.toml`):**
- Worker name: `tg-claude`
- Entry point: `src/index.ts`
- `workers_dev = true` (accessible at `*.workers.dev`)
- Observability enabled
- No KV namespace bindings yet (added in Phase 3)
- No cron triggers yet (added in Phase 5)

**Vitest (`vitest.config.ts`):**
- Environment: `node` (not using `@cloudflare/vitest-pool-workers` pool yet)
- No coverage configuration

**Environment/Secrets (via `wrangler secret put`, never in code):**
- `TELEGRAM_BOT_TOKEN` - Telegram Bot API identity
- `TELEGRAM_WEBHOOK_SECRET` - Webhook signature verification
- `ALLOWED_USER_ID` - Single-user allowlist
- `ANTHROPIC_API_KEY` - LLM API access (Phase 2+)
- `WEBHOOK_SECRET` - External webhook ingress auth (Phase 6+)

**Local Development:**
- `.dev.vars` file (gitignored) for local secrets
- `wrangler dev` for local Worker runtime

## Build & Run Commands

```bash
npm run test          # vitest run
npm run test:watch    # vitest (watch mode)
npm run typecheck     # tsc (type check only, no emit)
npx wrangler dev      # Local dev server
npx wrangler deploy   # Deploy to Cloudflare
```

## Platform Requirements

**Development:**
- Node.js 20.x+
- npm
- Wrangler 4.x (`npm install -g wrangler` or use `npx`)
- `wrangler login` for Cloudflare auth

**Production:**
- Cloudflare Workers Paid plan ($5/mo) - required for `waitUntil()` and cron triggers
- Workers KV namespaces: `CONV` (conversation state, 24h TTL), `OAUTH` (Google tokens, no TTL)
- Secrets stored via `wrangler secret put`

**Key Runtime Constraints:**
- 30s CPU time limit per request (Workers Paid)
- 128MB memory limit
- No filesystem access
- No long-running processes - must use `ctx.waitUntil()` for async work after response
- `fetch` is the only HTTP client available
- KV is eventually consistent (fine for conversation state, not for locks)

---

*Stack analysis: 2026-05-05*
