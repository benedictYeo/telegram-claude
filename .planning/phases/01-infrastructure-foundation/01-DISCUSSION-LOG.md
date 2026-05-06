# Phase 1: Infrastructure Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-06
**Phase:** 1-Infrastructure Foundation
**Areas discussed:** Migration approach, Mac mini reliability, Slash-command routing, SQLite setup, Logging strategy, Webhook registration, Project conventions

---

## Migration Approach

### How to handle existing CF Workers code?

| Option | Description | Selected |
|--------|-------------|----------|
| Port and adapt | Keep file structure, rewrite Env/entry for Hono, preserve auth/telegram/chunking/types | |
| Fresh start, reference only | New project from scratch using Hono conventions. Read existing code for patterns but don't carry files. | Yes |
| You decide | Let Claude pick | |

**User's choice:** Fresh start, reference only

### What happens to old CF Workers code?

| Option | Description | Selected |
|--------|-------------|----------|
| Delete it | Remove src/, wrangler.toml, vitest.config.ts. Git history preserves it. | |
| Move to archive/ | Move to archive/cloudflare/ for reference. Delete after Phase 1. | Yes |
| Keep in place | Build new code beside old code in separate directory. | |

**User's choice:** Move to archive/

### Where should new server code live?

| Option | Description | Selected |
|--------|-------------|----------|
| src/ | Standard layout: src/index.ts, src/routes/, src/lib/, src/types.ts | Yes |
| server/ | Separate directory to distinguish from old code | |

**User's choice:** src/

### Testing setup?

| Option | Description | Selected |
|--------|-------------|----------|
| Vitest + supertest | Keep Vitest, add supertest for HTTP integration tests. Drop CF pool workers. | Yes |
| Vitest only, manual fetch | Test Hono via built-in app.request() | |
| You decide | Let Claude pick | |

**User's choice:** Vitest + supertest

### Polyglot (TS + Python) from start?

| Option | Description | Selected |
|--------|-------------|----------|
| TypeScript only for now | No Python needed — Ollama/OpenAI/Anthropic all have REST APIs or TS SDKs. Add Python for v2 ML tasks if needed. | Yes |
| Monorepo with both | packages/bot (TS) + packages/ml (Python) from day 1. | |

**User's choice:** TypeScript only (after research confirmed Ollama has REST API callable from TS)

### Package manager?

| Option | Description | Selected |
|--------|-------------|----------|
| npm (keep current) | Already using npm with package-lock.json | Yes |
| pnpm | Faster installs, strict deps, disk-efficient | |
| bun | Fast runtime + pkg manager, less mature for production | |

**User's choice:** npm

---

## Mac Mini Reliability

### Sleep prevention?

| Option | Description | Selected |
|--------|-------------|----------|
| pmset + caffeinate | Belt-and-suspenders: pmset system-wide + caffeinate process-tied | Yes |
| pmset only | Single system-level config | |
| You decide | Let Claude pick | |

**User's choice:** pmset + caffeinate

### PM2 reboot survival?

| Option | Description | Selected |
|--------|-------------|----------|
| PM2 startup + launchd | pm2 startup generates launchd plist. Standard PM2 macOS pattern. | Yes |
| Custom launchd plist | Manual plist, no PM2. Simpler stack but loses restart policies. | |
| You decide | Let Claude pick | |

**User's choice:** PM2 startup + launchd
**Notes:** User asked "what is PM2?" — explained it's a Node.js process manager for auto-restart, log management, reboot survival.

### Process manager?

| Option | Description | Selected |
|--------|-------------|----------|
| PM2 (keep decision) | Industry standard Node.js process manager | Yes |
| Docker container | More isolated but adds Docker Desktop dependency | |
| Bare launchd plist | macOS-native, fewer features | |

**User's choice:** PM2

### Tailscale Funnel status?

| Option | Description | Selected |
|--------|-------------|----------|
| Already running | Just point at local port | |
| Tailscale installed, Funnel not | Phase 1 includes Funnel setup | |
| Neither set up | Full Tailscale + Funnel setup needed | Yes |

**User's choice:** Neither set up — full setup in Phase 1

### Secrets management?

| Option | Description | Selected |
|--------|-------------|----------|
| .env file + dotenv | Standard, gitignored, simple | Yes |
| System env vars | ~/.zshrc or launchd plist | |
| macOS Keychain | Most secure, adds complexity | |

**User's choice:** .env file + dotenv

### Setup script?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, setup script | scripts/setup.sh for PM2, pmset, Tailscale, webhook | Yes |
| README instructions only | Manual steps documented | |
| You decide | Let Claude pick | |

**User's choice:** Yes, setup script
**Notes:** User also requested a README.md with setup instructions (both script and docs).

---

## Slash-Command Routing

### Phase 1 commands?

| Option | Description | Selected |
|--------|-------------|----------|
| /help + /ping only | Minimal — prove routing works | Yes |
| /help + /ping + stubs | Plus stub responses for future commands | |
| You decide | Let Claude pick | |

**User's choice:** /help + /ping only

### Command router structure?

| Option | Description | Selected |
|--------|-------------|----------|
| Map registry | Map<string, CommandHandler> — extensible | Yes |
| Switch/case | Simple switch statement — less extensible | |
| Hono routes | Commands as Hono middleware — but commands aren't HTTP routes | |

**User's choice:** Map registry

### Unrecognized slash commands?

| Option | Description | Selected |
|--------|-------------|----------|
| Pass to AI | Treat as normal message, send to AI | Yes |
| Error message | Reply with "Unknown command" | |

**User's choice:** Pass to AI

### Non-text messages?

| Option | Description | Selected |
|--------|-------------|----------|
| Ignore silently | Return 200, no response | |
| Reply with hint | Reply: "Text only for now." | Yes |

**User's choice:** Reply with hint

### Phase 1 response to non-command messages?

| Option | Description | Selected |
|--------|-------------|----------|
| Echo back | Mirror message back (current behavior) | |
| Ack with placeholder | Reply: "Received. AI coming soon." | Yes |
| Silent ack | Return 200, no visible reply | |

**User's choice:** Ack with placeholder

---

## SQLite Setup

### SQLite library?

| Option | Description | Selected |
|--------|-------------|----------|
| better-sqlite3 | Fastest, synchronous API, used by Drizzle/Turso | Yes |
| node:sqlite (built-in) | Node.js 22+ experimental, no extra dep | |
| You decide | Let Claude pick | |

**User's choice:** better-sqlite3

### DB file location?

| Option | Description | Selected |
|--------|-------------|----------|
| data/bot.db (in project) | Project root, gitignored, easy backup | Claude's choice |
| ~/.telegram-claude/bot.db | Home dir, decoupled from project | |
| You decide | Let Claude pick | Yes |

**User's choice:** You decide — Claude chose data/bot.db

### Schema timing?

| Option | Description | Selected |
|--------|-------------|----------|
| Install only, schema in Phase 2 | Add dep and data/ dir only | Yes |
| Basic schema now | Migrations system + initial tables | |

**User's choice:** Install only, schema in Phase 2

---

## Logging Strategy

### Logger?

| Option | Description | Selected |
|--------|-------------|----------|
| pino | Fastest Node.js logger, structured JSON | Yes |
| console only | No dependency, no structure | |
| You decide | Let Claude pick | |

**User's choice:** pino

### Log rotation?

| Option | Description | Selected |
|--------|-------------|----------|
| PM2 log rotation | pm2-logrotate plugin, zero code | Yes |
| pino file transport | More control, more config | |
| You decide | Let Claude pick | |

**User's choice:** PM2 log rotation

---

## Webhook Registration

### How to register?

| Option | Description | Selected |
|--------|-------------|----------|
| Setup script | curl in scripts/setup.sh, one-time | Yes |
| Auto on startup | Server calls setWebhook on boot | |
| You decide | Let Claude pick | |

**User's choice:** Setup script

---

## Project Conventions

### Linting and formatting?

| Option | Description | Selected |
|--------|-------------|----------|
| Biome | Single tool, Rust-based, fast | |
| ESLint + Prettier | Industry standard, most mature | Yes |
| None for now | TypeScript strict only | |

**User's choice:** ESLint + Prettier (initially picked Biome, then asked to go back and changed)

### Git hooks?

| Option | Description | Selected |
|--------|-------------|----------|
| lefthook | Fast, zero-dep hook manager | Yes |
| husky + lint-staged | Most popular combo | |
| No hooks | Manual/CI only | |

**User's choice:** lefthook

---

## Claude's Discretion

- **D-23:** SQLite DB file location — chose `data/bot.db` in project root (gitignored)

## Deferred Ideas

None — discussion stayed within phase scope.
