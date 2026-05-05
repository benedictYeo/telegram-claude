# Coding Conventions

**Analysis Date:** 2026-05-05

## Naming Patterns

**Files:**
- Lowercase kebab-style is NOT used. Files use single lowercase words: `auth.ts`, `telegram.ts`, `types.ts`
- Test files mirror source file name with `.test.ts` suffix: `auth.test.ts`, `chunking.test.ts`
- One module per file. No barrel/index re-exports within subdirectories.

**Functions:**
- camelCase for all functions: `checkWebhookSignature`, `checkUserAllowed`, `handleTelegramWebhook`, `chunkMessage`, `tgSend`
- Prefix pattern by domain: `tg` prefix for Telegram API calls (`tgSend`, `tgSendChatAction`), `check` prefix for auth guards (`checkWebhookSignature`, `checkUserAllowed`), `handle` prefix for request handlers (`handleTelegramWebhook`)

**Variables:**
- camelCase: `chatId`, `fromId`, `parseMode`
- UPPER_SNAKE_CASE for module-level constants: `TG_API`, `MAX_CHUNK`

**Types/Interfaces:**
- PascalCase with domain prefix: `TgUser`, `TgChat`, `TgMessage`, `TgUpdate`, `TgCallbackQuery`
- `Tg` prefix for Telegram domain types, `Env` for the worker environment binding
- All types defined in `src/types.ts` as a central type registry

## Code Style

**Formatting:**
- No Prettier or ESLint configured. Formatting is manual/editor-based.
- 2-space indentation observed across all files
- Double quotes for strings (consistent across all source and test files)
- Semicolons always used
- Trailing commas in multi-line constructs (object literals, function parameters)

**Linting:**
- No ESLint, Biome, or other linter configured
- TypeScript strict mode (`"strict": true` in `tsconfig.json`) serves as the primary static analysis tool
- Type checking via `npm run typecheck` (runs `tsc`)

**TypeScript:**
- Strict mode is mandatory (`tsconfig.json` line 8)
- Target ES2022, module ES2022, bundler module resolution
- Use `type` keyword for type-only imports: `import type { Env } from "./types.js"`
- Unused parameters prefixed with underscore: `_ctx`, `_event`, `_env`

## Import Organization

**Order:**
1. Type imports (`import type { ... }`) come first
2. Module imports from project files second
3. No external package imports exist yet (zero runtime dependencies)

**Path Style:**
- Relative paths with `.js` extension: `"./types.js"`, `"../core/auth.js"`, `"../types.js"`
- Always include `.js` extension on local imports (required for ES module bundler resolution)
- No path aliases configured (no `paths` in tsconfig)

**Example (from `src/handlers/telegram.ts`):**
```typescript
import type { Env, TgUpdate } from "../types.js";
import { checkWebhookSignature, checkUserAllowed } from "../core/auth.js";
import { tgSend } from "../core/telegram.js";
```

## Error Handling

**Patterns:**
- Auth failures return early with appropriate HTTP status. Signature failures get `401`; unauthorized users get silent `200` (drop, no error message)
- JSON parse failures are caught and silently return `200` (see `src/handlers/telegram.ts` lines 14-18)
- Never expose error details to users. CLAUDE.md rule: generic icon + short message (`something failed`), real error logged by type only
- Use `Response | null` return pattern for guard functions: `null` means "passed", non-null `Response` means "failed" (see `src/core/auth.ts` `checkWebhookSignature`)

**Auth Gate Pattern (must appear at top of every handler):**
```typescript
const authFail = checkWebhookSignature(req, env);
if (authFail) return authFail;

// ... parse body ...

if (!checkUserAllowed(update, env)) {
  return new Response("ok"); // silent drop
}
```

**Error Response Convention:**
- Never echo user input on auth failure (CLAUDE.md hard rule)
- Return `new Response("ok")` for non-error drops (bad user, missing message)
- Return `new Response("not found", { status: 404 })` for unknown routes
- Return `new Response("unauthorized", { status: 401 })` for signature failures

## Logging

**Framework:** None (no logging library installed)

**Patterns:**
- Cloudflare Workers Observability is enabled (`wrangler.toml` `[observability] enabled = true`)
- No `console.log` calls in source code. Intentionally minimal logging.
- CLAUDE.md hard rule: never log message content, MCP responses, or user payloads
- Errors logged by type only, never content

## Comments

**When to Comment:**
- Sparingly. Only for non-obvious behavior or future-phase stubs
- Phase stubs use `// Stub -- [purpose] wired in Phase N` pattern (see `src/index.ts` line 20)
- Security-critical silence uses explanatory comment: `// Silent drop -- no log, no error` (see `src/handlers/telegram.ts` line 22)

**JSDoc/TSDoc:**
- Not used. No JSDoc comments anywhere in the codebase.

## Function Design

**Size:** Small, single-purpose functions. Largest function is ~20 lines (`handleTelegramWebhook`). Most are 5-10 lines.

**Parameters:**
- `env: Env` is the first or second parameter on nearly every function (worker binding pattern)
- Use default parameter values where sensible: `parseMode = "HTML"`, `max = MAX_CHUNK`
- Unused parameters prefixed with `_`: `_ctx: ExecutionContext`

**Return Values:**
- Guard functions return `Response | null` (null = pass)
- Boolean check functions return `boolean` directly
- Async API call functions return `Promise<void>` (fire-and-forget pattern)
- Handler functions return `Promise<Response>`

## Module Design

**Exports:**
- Named exports only. No default exports except the Worker entry point (`src/index.ts` `export default { ... }`)
- Each module exports only what is needed by other modules

**Barrel Files:**
- Not used. No `index.ts` re-export files in subdirectories.

## Dependency Philosophy

**Hard rule from CLAUDE.md:** No libraries that don't earn their weight. Specifically prohibited:
- `node-telegram-bot-api` -- use raw `fetch` instead
- `axios` -- use raw `fetch` instead
- Any Telegram bot framework

**Current state:** Zero runtime dependencies. All `devDependencies` only:
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

---

*Convention analysis: 2026-05-05*
