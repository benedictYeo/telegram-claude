# Phase 1: Infrastructure Foundation - Context

**Gathered:** 2026-05-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Migrate from Cloudflare Workers echo bot to an always-on Node.js server on Mac mini. Authenticated HTTP server running under PM2, exposed via Tailscale Funnel, receiving Telegram webhooks, with slash-command routing and safe error handling. This is the foundation — no AI, no state, no integrations.

</domain>

<decisions>
## Implementation Decisions

### Migration Approach
- **D-01:** Fresh start — new project structure from scratch. Old CF Workers code moved to `archive/` for reference during migration, deleted after Phase 1 is done.
- **D-02:** New code lives in `src/` (standard layout: `src/index.ts` entry, `src/routes/`, `src/lib/`, `src/types.ts`).
- **D-03:** TypeScript only for v1. Python deferred to v2 if ML-specific tasks (ADV-05) materialize. Ollama, OpenAI, and Anthropic all have REST APIs / TS SDKs — no Python needed for any v1 phase.
- **D-04:** npm as package manager (keep current).
- **D-05:** Testing with Vitest + supertest for HTTP integration tests against Hono app. Drop `@cloudflare/vitest-pool-workers`.

### Mac Mini Reliability
- **D-06:** Sleep prevention via pmset + caffeinate (belt-and-suspenders). `pmset displaysleep 0` system-wide + `caffeinate -s` as PM2 companion process.
- **D-07:** PM2 as process manager. `pm2 startup` generates a launchd plist for reboot survival.
- **D-08:** PM2 log rotation via `pm2-logrotate` plugin.
- **D-09:** Tailscale + Funnel need full setup as part of Phase 1 (neither installed yet on Mac mini).
- **D-10:** Secrets managed via `.env` file + dotenv (gitignored). Secrets stay on Mac mini filesystem.
- **D-11:** Phase 1 includes a `scripts/setup.sh` that installs PM2, configures pmset, runs `pm2 startup`, sets up Tailscale Funnel, and registers the Telegram webhook. Also includes a README.md with setup instructions.

### Slash-Command Routing
- **D-12:** Phase 1 commands: `/help` (shows available commands) and `/ping` (confirms bot is alive). No stubs for future commands.
- **D-13:** Command router uses a `Map<string, CommandHandler>` registry. Easy to add commands in future phases.
- **D-14:** Unrecognized slash commands pass through to AI handler (no error message). Flexible — AI can interpret intent.
- **D-15:** Non-text messages (photos, voice, stickers) reply with hint: "Text only for now."
- **D-16:** Non-command text messages reply with placeholder: "Received. AI coming soon." (not echo, not silent).

### SQLite
- **D-17:** better-sqlite3 as SQLite library. Installed in Phase 1, schema deferred to Phase 2.

### Logging
- **D-18:** pino as logger. Structured JSON output. pino-pretty for dev.
- **D-19:** Log rotation handled by PM2 via pm2-logrotate plugin (no pino file transport).

### Webhook Registration
- **D-20:** Telegram webhook registered via `scripts/setup.sh` (curl call to setWebhook API with Tailscale Funnel URL). One-time setup, not auto-on-startup.

### Project Conventions
- **D-21:** ESLint + Prettier for linting and formatting.
- **D-22:** lefthook for Git hooks. Pre-commit runs ESLint + Prettier + typecheck.

### Claude's Discretion
- **D-23:** SQLite database file location — Claude chose `data/bot.db` in project root (gitignored). Keeps everything together, easy to backup. PM2's cwd makes the path predictable. Fresh DB on re-clone is fine (conversation state has 24h TTL).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — Core value, constraints, key decisions (Mac mini, Tailscale Funnel, polyglot deferred)
- `.planning/REQUIREMENTS.md` — INFRA-01 through INFRA-11 requirements for this phase
- `.planning/ROADMAP.md` — Phase 1 goal, success criteria, dependencies

### Existing Codebase (Reference Only)
- `archive/` — Old CF Workers code (after migration). Auth patterns, Telegram client, chunking logic are reference material for new implementation.
- `.planning/codebase/ARCHITECTURE.md` — Current three-layer architecture (Handlers -> Core -> External APIs)
- `.planning/codebase/STACK.md` — Current CF Workers stack details (being replaced)
- `.planning/codebase/INTEGRATIONS.md` — Telegram Bot API integration patterns (transferable)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Auth logic (`src/core/auth.ts`): Webhook signature check and user ID allowlist. Logic transfers to Hono middleware — implementation changes, pattern stays.
- Telegram client (`src/core/telegram.ts`): Raw `fetch` sendMessage, chunking at 4000 chars, typing indicators. Fully transferable — `fetch` works on Node.js.
- Telegram types (`src/types.ts`): TgUser, TgChat, TgMessage, TgUpdate, TgCallbackQuery. Fully reusable as-is.

### Established Patterns
- Two-layer auth: webhook signature header check (401 on fail) + user ID allowlist (silent 200 drop). Must be preserved.
- HTML parse mode only (never MarkdownV2). Hard rule carried forward.
- No content logging. Error logged by type only. Hard rule carried forward.
- Raw `fetch` for all Telegram API calls (no library). Carried forward.

### Integration Points
- Telegram Bot API: sendMessage, sendChatAction, setWebhook — same endpoints, new server URL (Tailscale Funnel).
- Entry point changes from CF Workers `export default { fetch() }` to Hono `app.listen()` via `@hono/node-server`.

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 1-Infrastructure Foundation*
*Context gathered: 2026-05-06*
