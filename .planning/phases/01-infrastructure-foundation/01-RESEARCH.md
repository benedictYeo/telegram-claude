# Phase 1: Infrastructure Foundation - Research

**Researched:** 2026-05-06
**Domain:** Node.js HTTP server on Mac mini (Hono + PM2 + Tailscale Funnel)
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Fresh start — new project structure from scratch. Old CF Workers code moved to `archive/` for reference, deleted after Phase 1 is done.
- **D-02:** New code in `src/` (standard layout: `src/index.ts` entry, `src/routes/`, `src/lib/`, `src/types.ts`).
- **D-03:** TypeScript only for v1. Python deferred to v2.
- **D-04:** npm as package manager (keep current).
- **D-05:** Testing with Vitest + supertest for HTTP integration tests against Hono app. Drop `@cloudflare/vitest-pool-workers`.
- **D-06:** Sleep prevention via pmset + caffeinate (belt-and-suspenders). `pmset displaysleep 0` system-wide + `caffeinate -s` as PM2 companion process.
- **D-07:** PM2 as process manager. `pm2 startup` generates a launchd plist for reboot survival.
- **D-08:** PM2 log rotation via `pm2-logrotate` plugin.
- **D-09:** Tailscale + Funnel need full setup as part of Phase 1 (neither installed yet on Mac mini).
- **D-10:** Secrets managed via `.env` file + dotenv (gitignored). Secrets stay on Mac mini filesystem.
- **D-11:** Phase 1 includes a `scripts/setup.sh` that installs PM2, configures pmset, runs `pm2 startup`, sets up Tailscale Funnel, and registers the Telegram webhook. Also includes a README.md with setup instructions.
- **D-12:** Phase 1 commands: `/help` and `/ping`. No stubs for future commands.
- **D-13:** Command router uses a `Map<string, CommandHandler>` registry.
- **D-14:** Unrecognized slash commands pass through to AI handler (no error message).
- **D-15:** Non-text messages reply with hint: "Text only for now."
- **D-16:** Non-command text messages reply with placeholder: "Received. AI coming soon."
- **D-17:** better-sqlite3 as SQLite library. Installed in Phase 1, schema deferred to Phase 2.
- **D-18:** pino as logger. Structured JSON output. pino-pretty for dev.
- **D-19:** Log rotation handled by PM2 via pm2-logrotate plugin (no pino file transport).
- **D-20:** Telegram webhook registered via `scripts/setup.sh` (curl call to setWebhook API).
- **D-21:** ESLint + Prettier for linting and formatting.
- **D-22:** lefthook for Git hooks. Pre-commit runs ESLint + Prettier + typecheck.

### Claude's Discretion

- **D-23:** SQLite database file at `data/bot.db` in project root (gitignored).

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | Server runs on Mac mini via Node.js, exposed via Tailscale Funnel | Hono + @hono/node-server; Tailscale Funnel CLI pattern documented |
| INFRA-02 | PM2 manages process lifecycle with auto-restart on crash and reboot | PM2 ecosystem.config.js; `pm2 startup` for launchd; `pm2 save` |
| INFRA-03 | Mac mini sleep prevention configured (always available) | `pmset -a sleep 0 disksleep 0 displaysleep 0` + `caffeinate -s` PM2 app |
| INFRA-04 | Auth gate verifies Telegram webhook secret header on every request | X-Telegram-Bot-Api-Secret-Token header verification; ported from existing auth.ts |
| INFRA-05 | Auth gate silently drops messages from non-allowed user IDs | Silent 200 return pattern; ported from existing auth.ts |
| INFRA-06 | Ack-and-defer pattern — respond 200 immediately, process async | setImmediate() fire-and-forget in Node.js handler; return c.text("ok") first |
| INFRA-07 | Typing indicator sent before every AI call | tgSendChatAction("typing"); existing telegram.ts pattern transferable |
| INFRA-08 | Message chunking at 4000 chars | chunkMessage(); existing telegram.ts pattern transferable |
| INFRA-09 | Health check endpoint (no auth, no info disclosure) | GET /health returns 200 "ok"; no env info in response body |
| INFRA-10 | Slash-command routing (prefix match before AI dispatch) | Map<string, CommandHandler> registry; /help, /ping in Phase 1 |
| INFRA-11 | Generic error feedback to user, real error logged by type only | pino.error({ type: err.constructor.name }); tgSend generic message |
</phase_requirements>

---

## Summary

Phase 1 migrates the existing Cloudflare Workers echo bot to an always-on Node.js server running on Mac mini. The existing CF Workers codebase has three directly reusable modules: `src/core/auth.ts` (webhook signature check + user allowlist), `src/core/telegram.ts` (raw fetch sendMessage + chunking), and `src/types.ts` (all Telegram types). These move to the new layout with zero logic changes — only the surrounding framework changes from CF Workers to Hono.

The new server uses Hono 4.x with `@hono/node-server` as the HTTP layer. PM2 manages the process lifecycle (crash restart, memory limits, launchd-based reboot survival). Tailscale Funnel exposes port 3000 to the public internet on the Mac mini's tailnet HTTPS URL — no port forwarding, no reverse proxy needed. Sleep prevention uses belt-and-suspenders: `pmset -a sleep 0` system-wide plus `caffeinate -s` as a PM2 companion app. Secrets live in a gitignored `.env` file loaded by dotenv at startup; Node 25 also supports `--env-file` natively but dotenv is more portable across Node versions and consistent with D-10.

The ack-and-defer pattern in Node.js differs from CF Workers: instead of `ctx.waitUntil()`, the handler schedules async work with `setImmediate()` (or `Promise.resolve().then()`) before returning the immediate `c.text("ok")`. This keeps the Telegram 60s webhook timeout satisfied while allowing Claude calls to run asynchronously.

**Primary recommendation:** Port auth + telegram modules as-is, build Hono app around them, deploy under PM2 with tsx interpreter running TypeScript directly (no compile step in production).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| HTTP server / request routing | Backend (Node.js) | — | Hono app on @hono/node-server |
| Webhook auth (signature + user ID) | Backend middleware | — | Must run server-side, never client |
| Ack-and-defer response | Backend (Node.js event loop) | — | setImmediate schedules after response flush |
| Telegram message dispatch | Backend (Core lib) | — | Raw fetch to Telegram Bot API |
| Message chunking | Backend (Core lib) | — | Pure function; no I/O |
| Slash-command routing | Backend (Route handler) | — | Map registry before AI dispatch |
| Process lifecycle / crash recovery | OS layer (PM2) | launchd (reboot) | Process manager outside app code |
| Sleep prevention | OS layer (pmset + caffeinate) | — | System power management |
| TLS / public exposure | Network layer (Tailscale Funnel) | — | Funnel handles TLS termination |
| Secrets | Filesystem (.env) | — | Read at startup, never logged |
| Structured logging | Backend (pino) | PM2 (rotation) | JSON to stdout, PM2 rotates files |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| hono | 4.12.17 | HTTP framework (Web Standards API) | Works on Workers and Node.js; testClient built-in; no lock-in |
| @hono/node-server | 2.0.1 | Node.js adapter for Hono | Official adapter; `serve()` with Node http module |
| tsx | 4.21.0 | TypeScript runner for Node.js (PM2 interpreter) | No compile step; strip-types; faster than ts-node |
| dotenv | 17.4.2 | Load .env into process.env at startup | Industry standard; 0 deps; gitignored file pattern |
| pino | 10.3.1 | Structured JSON logger | Lowest overhead JSON logger for Node.js |
| pino-pretty | 13.1.3 | Human-readable pino output for dev | Dev dependency only |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| better-sqlite3 | 12.9.0 | Synchronous SQLite client | Installed Phase 1; schema wired Phase 2 |
| @types/better-sqlite3 | 7.6.13 | TypeScript types for better-sqlite3 | Required — no built-in types |
| @types/node | 25.6.0 | Node.js type definitions | Required for process, setImmediate, etc. |
| vitest | 4.1.4 | Test runner (already installed) | Keep; works with node env |
| supertest | 7.2.2 | HTTP integration tests | For testing Hono handlers via real HTTP |
| @types/supertest | 7.2.0 | TypeScript types for supertest | Required |
| eslint | 10.3.0 | Linting | Flat config (eslint.config.js) |
| @typescript-eslint/eslint-plugin | 8.59.2 | TypeScript ESLint rules | Required for TS linting |
| @typescript-eslint/parser | 8.59.2 | ESLint TypeScript parser | Required |
| eslint-config-prettier | 10.1.8 | Disables ESLint rules that conflict with Prettier | Standard pairing |
| prettier | 3.8.3 | Code formatter | Consistent formatting |
| lefthook | 2.1.6 | Git hooks | Pre-commit: lint + format + typecheck |
| pm2 | 7.0.1 | Process manager | Global install on Mac mini |
| pm2-logrotate | 3.0.0 | PM2 log rotation plugin | Global install on Mac mini via `pm2 install` |

[VERIFIED: npm registry — all versions confirmed via `npm view <package> version` on 2026-05-06]

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| tsx (interpreter) | Compile TS → JS then run | Compile step adds complexity; tsx is simpler for single-process app |
| dotenv | Node `--env-file` flag | `--env-file` is Node 20.6+ native, but dotenv more explicit and portable |
| pino | winston / console.log | pino is 5-10x faster, JSON native, less overhead |
| supertest | Hono `testClient` | testClient is type-safe but less familiar for HTTP integration tests; D-05 specifies supertest |
| lefthook | husky + lint-staged | lefthook is a single binary, no Node dependency; D-22 specifies it |

**Installation:**
```bash
# Runtime dependencies
npm install hono @hono/node-server tsx dotenv pino better-sqlite3

# Dev dependencies
npm install -D pino-pretty @types/better-sqlite3 @types/node supertest @types/supertest eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-config-prettier prettier lefthook

# Global (Mac mini setup — run in setup.sh)
npm install -g pm2
pm2 install pm2-logrotate
```

---

## Architecture Patterns

### System Architecture Diagram

```
Telegram servers
    |
    | POST /webhook (HTTPS)
    v
Tailscale Funnel (TLS termination, public URL)
    |
    | HTTP to localhost:3000
    v
Hono app (@hono/node-server)
    |
    +-- POST /webhook
    |       |
    |       +-- [1] Auth middleware: check X-Telegram-Bot-Api-Secret-Token → 401 on fail
    |       +-- [2] Auth middleware: check user ID → silent 200 drop on non-allowed
    |       +-- [3] Parse JSON body → TgUpdate
    |       +-- [4] Dispatch: slash command? → CommandRouter → CommandHandler
    |       |                  non-text? → "Text only for now."
    |       |                  plain text? → "Received. AI coming soon." (Phase 1)
    |       +-- [5] setImmediate(asyncWork) → return 200 immediately (ack-and-defer)
    |
    +-- GET /health → 200 "ok" (no auth)
    |
    +-- * → 404 "not found"
    |
    v
pino logger (structured JSON to stdout)
    |
PM2 captures stdout/stderr → log files
    |
pm2-logrotate → rotates log files

External calls (inside setImmediate):
    Telegram Bot API (sendMessage, sendChatAction) ← raw fetch
```

### Recommended Project Structure
```
src/
├── index.ts          # Hono app + serve() entry point
├── types.ts          # Env interface + Telegram types (ported as-is)
├── routes/
│   └── telegram.ts   # POST /webhook handler
├── lib/
│   ├── auth.ts       # Webhook signature check + user allowlist (ported)
│   ├── telegram.ts   # tgSend, tgSendChatAction, chunkMessage (ported)
│   └── commands.ts   # CommandRouter Map + /help and /ping handlers
archive/
├── (old CF Workers code — for reference during migration)
data/
└── bot.db            # SQLite (gitignored; schema wired Phase 2)
scripts/
└── setup.sh          # Mac mini setup: PM2, pmset, Tailscale Funnel, webhook
ecosystem.config.cjs  # PM2 ecosystem config (CJS required by PM2)
.env                  # Secrets (gitignored)
.env.example          # Template (committed)
```

### Pattern 1: Hono App with Env Bindings

The Hono `Bindings` generic replaces CF Workers' `Env` interface. In Node.js, `c.env` is populated from `process.env`.

```typescript
// Source: https://hono.dev/docs/api/hono
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import "dotenv/config";

type Bindings = {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  ALLOWED_USER_ID: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/health", (c) => c.text("ok"));
app.post("/webhook", handleTelegramWebhook);

serve({ fetch: app.fetch, port: 3000 });
```

In Node.js, `c.env` reads from `process.env`. Populate by calling `import "dotenv/config"` at the top of `index.ts` before any other imports.

### Pattern 2: Ack-and-Defer in Node.js

CF Workers used `ctx.waitUntil()`. Node.js uses `setImmediate()` — fires after the current I/O event (after response is flushed to the socket).

```typescript
// Source: [VERIFIED: Node.js event loop behavior]
app.post("/webhook", async (c) => {
  const body = await c.req.json<TgUpdate>();

  // Auth checks run synchronously before ack
  const authFail = checkWebhookSignature(c.req.raw, c.env);
  if (authFail) return authFail;
  if (!checkUserAllowed(body, c.env)) return c.text("ok");

  // Schedule async work AFTER response
  setImmediate(() => {
    processUpdate(body, c.env).catch((err) => {
      logger.error({ type: err.constructor.name }, "processUpdate failed");
    });
  });

  return c.text("ok");  // Telegram receives 200 immediately
});
```

Note: `setImmediate` fires after I/O callbacks. The HTTP response is sent before `setImmediate` runs — this is the Node.js equivalent of CF Workers' `waitUntil`.

### Pattern 3: PM2 Ecosystem Config with tsx

PM2 requires a CJS ecosystem file (`.cjs` extension or `module.exports`). The tsx interpreter runs TypeScript directly.

```javascript
// Source: https://pm2.keymetrics.io/docs/usage/application-declaration/
// ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "tg-claude",
      script: "src/index.ts",
      interpreter: "node",
      interpreter_args: "--import tsx/esm",
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      max_memory_restart: "256M",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
    },
    {
      name: "tg-claude-caffeinate",
      script: "caffeinate",
      interpreter: "none",
      args: "-s",
      autorestart: true,
    },
  ],
};
```

**Note on tsx + ESM:** tsx 4.x supports `--import tsx/esm` for native ESM. The ecosystem config uses `interpreter: "node"` with `interpreter_args: "--import tsx/esm"` to run `src/index.ts` directly. Alternatively, use tsx as the interpreter directly: `interpreter: "tsx"` — verify which works on the Mac mini's Node version at setup time.

### Pattern 4: Slash Command Router

```typescript
// Source: D-13 (Map<string, CommandHandler> registry pattern)
type CommandHandler = (chatId: number, env: Env) => Promise<void>;

const commands = new Map<string, CommandHandler>([
  ["help", handleHelp],
  ["ping", handlePing],
]);

export async function routeCommand(
  text: string,
  chatId: number,
  env: Env
): Promise<boolean> {
  if (!text.startsWith("/")) return false;
  const [cmd] = text.slice(1).split(" ");
  const handler = commands.get(cmd.toLowerCase());
  if (!handler) return false; // D-14: pass through to AI
  await handler(chatId, env);
  return true;
}
```

### Pattern 5: Hono Testing with supertest

D-05 specifies supertest. Hono Node.js app is passed to supertest as an http.Server or via `app.fetch` adapter.

```typescript
// Source: [VERIFIED: supertest docs + Hono node-server pattern]
import { createServer } from "http";
import { serve } from "@hono/node-server";
import supertest from "supertest";
import app from "../src/index.js";

// Option A: supertest with http.createServer from Hono's handler
const server = createServer((req, res) =>
  app.fetch(req as any, res as any)
);
const request = supertest(server);

it("GET /health returns 200", async () => {
  await request.get("/health").expect(200).expect("ok");
});
```

**Simpler alternative:** Use Hono's built-in `testClient` for unit-level handler tests (no HTTP server needed), and supertest only for full integration tests that need real HTTP.

### Anti-Patterns to Avoid

- **Awaiting processUpdate before returning:** Violates ack-and-defer. Always `setImmediate` then return immediately.
- **Logging message content:** Hard rule. Log `{ type: err.constructor.name }` only, never message text.
- **Using MarkdownV2 in Telegram:** Always `parse_mode: "HTML"`. Hard rule.
- **pm2 `watch: true` in production:** Causes restart loops on log file changes. Always `watch: false`.
- **Putting secrets in ecosystem.config.cjs:** PM2 ecosystem files may be committed. Load secrets from `.env` via dotenv only.
- **`pm2 startup` without `pm2 save`:** `pm2 startup` creates the launchd plist but `pm2 save` is required to persist the process list. Both must run.
- **Funnel without `--bg` flag:** Without `-bg`, Tailscale Funnel runs in foreground and dies when terminal closes. Let PM2 manage caffeinate; let Tailscale Funnel run as a background service.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP parsing + routing | Custom HTTP handler | Hono | Path params, method matching, middleware chain — edge cases compound |
| Process restart on crash | Shell script + cron | PM2 | Exponential backoff, memory limits, log capture, startup integration |
| Log rotation | Custom file rotation | pm2-logrotate | PM2 plugin handles all edge cases (max size, max files, compression) |
| Public HTTPS exposure | nginx + certbot + port forward | Tailscale Funnel | No router config, auto-provisioned TLS cert, no open ports |
| Sleep prevention | LaunchAgent plist | pmset + caffeinate | pmset is system-wide; caffeinate prevents all sleep including lid-close |
| Git hooks | Shell scripts in .git/hooks | lefthook | Cross-platform, parallel execution, easy config |

**Key insight:** Each of these "simple" problems has production failure modes that the listed tool already handles. Custom solutions regress to them within weeks.

---

## Runtime State Inventory

> Phase 1 is not a rename/refactor phase — it is a migration/greenfield phase. However, the migration requires archiving existing CF Workers state:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Cloudflare Workers KV (CONV, OAUTH) — no data yet (echo bot only) | None — no records to migrate |
| Live service config | Telegram webhook currently points to CF Workers URL (if set) | Re-register webhook to Tailscale Funnel URL via setup.sh |
| OS-registered state | No PM2, no launchd plist on Mac mini (D-09: neither installed yet) | setup.sh: install PM2, run `pm2 startup`, `pm2 save` |
| Secrets/env vars | CF Workers secrets (wrangler secret put) — stay in Cloudflare | New secrets go in `.env` on Mac mini filesystem only |
| Build artifacts | wrangler.toml, CF Workers src files | Move to `archive/` as reference; delete after Phase 1 verified |

---

## Common Pitfalls

### Pitfall 1: PM2 startup without sudo
**What goes wrong:** `pm2 startup` outputs a command that must be run with sudo to install the launchd plist. Running `pm2 startup` alone does nothing — it prints the sudo command for the user to copy-paste.
**Why it happens:** PM2 cannot write to /Library/LaunchDaemons without root.
**How to avoid:** setup.sh must echo the sudo command clearly or prompt for it. Automate with: `sudo env PATH=$PATH:$(which node) $(which pm2) startup launchd -u $USER --hp $HOME`
**Warning signs:** Reboot does not bring PM2 back up.

### Pitfall 2: PM2 caffeinate app on macOS
**What goes wrong:** caffeinate exits when the terminal session ends, or PM2 tries to restart it incorrectly because `caffeinate` is not a Node.js script.
**Why it happens:** PM2 defaults to Node.js interpreter. caffeinate is a system binary.
**How to avoid:** In ecosystem.config.cjs, set `interpreter: "none"` for caffeinate app, or use `script: "/usr/bin/caffeinate"` with `args: "-s"`.
**Warning signs:** PM2 shows caffeinate as "errored" in `pm2 list`.

### Pitfall 3: Tailscale Funnel HTTPS prerequisite
**What goes wrong:** `tailscale funnel 3000` fails with "HTTPS not enabled on tailnet."
**Why it happens:** Funnel requires HTTPS to be enabled in the Tailscale admin panel first. The interactive CLI flow handles this automatically, but non-interactive (script) invocation may not.
**How to avoid:** setup.sh should first run `tailscale funnel 3000` interactively (not in a sub-shell) to allow the browser-based approval flow. Document this as a manual step in README.md.
**Warning signs:** `tailscale funnel status` shows "No serve config."

### Pitfall 4: tsx interpreter path in PM2
**What goes wrong:** PM2 cannot find `tsx` because it is installed locally (not globally), and PM2's PATH may not include `node_modules/.bin`.
**Why it happens:** PM2 uses its own PATH, which may differ from the shell PATH.
**How to avoid:** Either (a) install tsx globally (`npm install -g tsx`), or (b) use `interpreter: "node"` with `interpreter_args: "--import tsx/esm"` pointing to the project's local tsx via absolute path.
**Warning signs:** PM2 shows "Error: Cannot find module 'tsx'" in logs.

### Pitfall 5: dotenv/config import order
**What goes wrong:** Environment variables are `undefined` in module-level code because `dotenv/config` was imported after the module that reads them.
**Why it happens:** ES module `import` hoisting means side-effect imports run in declaration order.
**How to avoid:** `import "dotenv/config"` must be the first import in `src/index.ts`. Or use `dotenv.config()` in a dedicated `src/lib/env.ts` that is imported first.
**Warning signs:** `process.env.TELEGRAM_BOT_TOKEN` is undefined at startup.

### Pitfall 6: Telegram webhook 60-second timeout
**What goes wrong:** Telegram retries the webhook if no 200 is received within 60 seconds, causing duplicate message processing.
**Why it happens:** Awaiting async work (Claude calls, etc.) in the handler before returning.
**How to avoid:** `setImmediate(() => processUpdate(...))` + `return c.text("ok")` — always ack first. Phase 1 has no AI calls, but establish this pattern now.
**Warning signs:** Duplicate messages in Telegram; PM2 logs show repeated webhook requests for the same update_id.

### Pitfall 7: pmset sleep settings vs. caffeinate
**What goes wrong:** `pmset -a sleep 0` alone does not prevent lid-close sleep on laptops, and `caffeinate -s` does not prevent scheduled sleep on desktops.
**Why it happens:** Different power assertion types cover different sleep triggers.
**How to avoid:** Belt-and-suspenders: both `pmset -a sleep 0 disksleep 0 displaysleep 0` AND `caffeinate -s` as a PM2 companion process. For a Mac mini (desktop), `pmset -a sleep 0` should be sufficient, but caffeinate provides redundancy.
**Warning signs:** Mac mini unresponsive in the morning; PM2 shows last heartbeat was overnight.

---

## Code Examples

Verified patterns from official sources:

### Hono app entry point (Node.js)
```typescript
// Source: https://hono.dev/docs/getting-started/nodejs
import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.text("ok"));
app.post("/webhook", handleTelegramWebhook);

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) });
```

### PM2 startup sequence (setup.sh)
```bash
# Source: https://pm2.keymetrics.io/docs/usage/startup/
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 startup launchd
# PM2 prints a command — run it with sudo:
sudo env PATH=$PATH:$(which node) $(which pm2) startup launchd -u $USER --hp $HOME
pm2 save
pm2 install pm2-logrotate
```

### Tailscale Funnel (setup.sh — interactive step)
```bash
# Source: https://tailscale.com/docs/reference/tailscale-cli/funnel
# Must be run interactively — prompts for browser approval on first use
tailscale funnel 3000
# After approval, run with --bg to persist:
tailscale funnel --bg 3000
```

### Telegram webhook registration (setup.sh)
```bash
# Source: https://core.telegram.org/bots/api#setwebhook
curl -s -X POST \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"${FUNNEL_URL}/webhook\",
    \"secret_token\": \"${TELEGRAM_WEBHOOK_SECRET}\",
    \"allowed_updates\": [\"message\", \"callback_query\"]
  }"
```

### pino logger setup
```typescript
// Source: https://github.com/pinojs/pino/blob/main/docs/api.md
import pino from "pino";

export const logger = pino({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  transport: process.env.NODE_ENV !== "production"
    ? { target: "pino-pretty" }
    : undefined,
});
```

### supertest integration test
```typescript
// Source: [VERIFIED: supertest + Hono node-server pattern]
import { describe, it } from "vitest";
import supertest from "supertest";
import { createServer } from "http";
import { handle } from "@hono/node-server/handler";
import app from "../src/index.js";

const server = createServer(handle(app));
const req = supertest(server);

describe("GET /health", () => {
  it("returns 200", async () => {
    await req.get("/health").expect(200);
  });
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ts-node as PM2 interpreter | tsx as PM2 interpreter | tsx GA ~2023 | tsx is faster, native ESM, no tsconfig.json needed |
| CF Workers `ctx.waitUntil()` | Node.js `setImmediate()` | N/A (different runtime) | Same semantic: defer async work past response |
| Cloudflare Workers KV | SQLite via better-sqlite3 | This phase | Local, synchronous, no TTL management needed |
| wrangler secret put | .env file (gitignored) | This phase | Simpler for single-machine deploy |
| ESLint flat config (eslint.config.js) | replaces .eslintrc | ESLint 9+ | ESLint 10 (installed) requires flat config |

**Deprecated/outdated:**
- `@cloudflare/vitest-pool-workers`: D-05 explicitly drops this. Vitest with `environment: "node"` is the replacement.
- `wrangler.toml` and CF Workers deployment: Archived. New deploy is `pm2 start ecosystem.config.cjs`.
- `ts-node`: Replaced by tsx. tsx is faster, ESM-native, and maintained.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `interpreter: "node"` with `--import tsx/esm` works correctly in PM2 7.x for running TypeScript directly | Standard Stack / Pattern 3 | PM2 may not find tsx; fallback is `interpreter: "tsx"` with tsx globally installed |
| A2 | Tailscale Funnel `--bg` persists across reboots without additional configuration | Pattern 5 / Pitfall 3 | Funnel may not start on reboot; may need PM2 to manage `tailscale funnel --bg 3000` as an app |
| A3 | `@hono/node-server` `handle()` export works as supertest server factory | Code Examples | If not exported, use `createServer` with `app.fetch` wrapped manually |
| A4 | Mac mini (not this MacBook Pro) has same Node/npm versions available | Environment Availability | setup.sh must include Node install instructions if not present |

---

## Open Questions (RESOLVED)

1. **tsx interpreter flag in PM2 7.x** -- RESOLVED
   - What we know: tsx 4.x supports `--import tsx/esm` for Node.js native ESM
   - Resolution: Plan 01-04 uses `interpreter: "node"` with `interpreter_args: "--import tsx/esm"` as primary approach. setup.sh also installs tsx globally (`npm install -g tsx`) as fallback. If `--import tsx/esm` fails at runtime, the executor switches to `interpreter: "tsx"` (global). Both paths are documented in the ecosystem config and README.

2. **Tailscale Funnel reboot persistence** -- RESOLVED
   - What we know: `tailscale funnel --bg 3000` runs in background; Tailscale has a system daemon
   - Resolution: Plan 01-05 (smoke test checkpoint) includes a reboot test (step 14-17) that explicitly verifies Funnel survives reboot. If it does not persist, the fallback (documented in RESEARCH.md Pitfall 3) is to add `tailscale funnel --bg 3000` as a third PM2 app with `interpreter: "none"`. The executor applies the fallback during the smoke test if needed.

3. **Port choice** -- RESOLVED
   - What we know: Tailscale Funnel supports ports 443, 8443, 10000 externally; internally any port works
   - Resolution: Port 3000 is the default in ecosystem.config.cjs and .env.example. Configurable via `PORT` env var. If 3000 is in use on the Mac mini, the user changes it in .env before running setup.sh. No code changes needed.

---

## Environment Availability

> This is the researcher's machine (MacBook Pro). The target deployment machine is the Mac mini. Environment availability on the Mac mini is unknown — setup.sh must handle installation.

| Dependency | Required By | Available (this machine) | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 20+ | All | ✓ | v25.6.1 | — |
| npm | All | ✓ | 11.9.0 | — |
| Tailscale | INFRA-01 | ✓ | 1.94.1 | — |
| caffeinate | INFRA-03 | ✓ | /usr/bin/caffeinate | — |
| pmset | INFRA-03 | ✓ | macOS built-in | — |
| PM2 | INFRA-02 | ✗ | — | `npm install -g pm2` (in setup.sh) |
| tsx (global) | INFRA-01 | ✗ | — | `npm install -g tsx` (in setup.sh) |
| lefthook | D-22 | ✗ | — | `npm install -g lefthook` (in setup.sh) |

**Missing dependencies with no fallback:**
- None that can't be installed via npm or Homebrew.

**Missing dependencies with fallback:**
- PM2 (not global): `npm install -g pm2` in setup.sh.
- tsx (not global): either global install or local use with `interpreter: "node"`.

**Note on target machine (Mac mini):** setup.sh must verify Node.js >= 20 is installed. If not, install via Homebrew or nvm. The researched machine has Node 25 — the Mac mini status is unknown.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 |
| Config file | `vitest.config.ts` (exists, `environment: "node"`) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-04 | Signature check returns 401 on wrong header | unit | `npx vitest run test/auth.test.ts` | ✅ exists (auth.test.ts) |
| INFRA-05 | Non-allowed user ID returns silent 200 | unit | `npx vitest run test/auth.test.ts` | ✅ exists (auth.test.ts) |
| INFRA-08 | chunkMessage splits at 4000 chars | unit | `npx vitest run test/chunking.test.ts` | ✅ exists (chunking.test.ts) |
| INFRA-09 | GET /health returns 200 | integration | `npx vitest run test/routes.test.ts` | ❌ Wave 0 |
| INFRA-06 | POST /webhook acks 200 before async work | integration | `npx vitest run test/routes.test.ts` | ❌ Wave 0 |
| INFRA-10 | /ping command returns pong | integration | `npx vitest run test/commands.test.ts` | ❌ Wave 0 |
| INFRA-10 | /help command returns command list | integration | `npx vitest run test/commands.test.ts` | ❌ Wave 0 |
| INFRA-11 | Error sends generic message, logs type only | unit | `npx vitest run test/errors.test.ts` | ❌ Wave 0 |
| INFRA-01, INFRA-02, INFRA-03 | Server alive after restart; sleep prevention | manual | Manual smoke test after deploy | manual-only |

**Manual-only justification:** INFRA-01/02/03 require physical Mac mini + PM2 + pmset + caffeinate — cannot be automated in unit/integration tests.

### Sampling Rate
- **Per task commit:** `npx vitest run`
- **Per wave merge:** `npx vitest run` (full suite)
- **Phase gate:** Full suite green + manual smoke test on Mac mini before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/routes.test.ts` — covers INFRA-09 (health check) and INFRA-06 (ack-and-defer)
- [ ] `test/commands.test.ts` — covers INFRA-10 (/ping, /help command routing)
- [ ] `test/errors.test.ts` — covers INFRA-11 (error handling)

*(Existing: `test/auth.test.ts`, `test/chunking.test.ts` — both pass, both transferable to new layout)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Single user; token-based, not credential-based |
| V3 Session Management | no | Stateless webhook; no sessions in Phase 1 |
| V4 Access Control | yes | User ID allowlist; silent drop pattern |
| V5 Input Validation | yes | JSON parse with try/catch; text content not parsed |
| V6 Cryptography | yes | HMAC-SHA256 for webhook signature (done by Telegram; we verify the header) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged webhook (not from Telegram) | Spoofing | X-Telegram-Bot-Api-Secret-Token header check; 401 on mismatch |
| Message from unauthorized Telegram user | Elevation of Privilege | User ID allowlist check; silent 200 drop (no confirmation to attacker) |
| Bot token exposure in logs | Information Disclosure | Hard rule: no content logging; secrets only in .env, never in code |
| Replay / duplicate update_id | Tampering | Not in Phase 1 scope (CLAUDE.md: Phase 8 for idempotency) |
| Health endpoint info disclosure | Information Disclosure | /health returns only "ok" — no version, env, or config info |

**Note on timing attacks:** The webhook secret header comparison uses `===` (string equality). This is a LOW severity issue — a constant-time comparison (`crypto.timingSafeEqual`) would be more rigorous. Accept for Phase 1 (the secret is not a user password; timing leakage has low exploitability). Add to backlog if needed.

---

## Project Constraints (from CLAUDE.md)

The following directives from CLAUDE.md carry forward into the Node.js server:

| Directive | Applies in Phase 1 |
|-----------|-------------------|
| No `node-telegram-bot-api` — raw `fetch` | Yes — Telegram client stays raw fetch |
| No `axios` — raw `fetch` | Yes |
| HTML parse mode only, never MarkdownV2 | Yes |
| No content logging | Yes — pino logs type only, never message text |
| Auth gate at top of every handler | Yes — webhook handler checks signature first |
| Silent 200 drop on bad user (not 403) | Yes |
| Secrets never in code or committed files | Yes — `.env` is gitignored |
| Chunk messages at 4000 chars | Yes — chunkMessage() ported |
| Generic error to user, error type logged | Yes |

CLAUDE.md also specifies Cloudflare Workers conventions (wrangler, KV TTL, `ctx.waitUntil`) — these are superseded by D-01 through D-11 from CONTEXT.md. The new Node.js conventions (Hono, PM2, dotenv) replace them.

---

## Sources

### Primary (HIGH confidence)
- Context7 `/llmstxt/hono_dev_llms_txt` — Hono middleware, env bindings, testClient, serve pattern
- Context7 `/websites/pm2_keymetrics_io` — PM2 ecosystem config, startup, launchd
- Context7 `/unitech/pm2` — PM2 ecosystem complete config reference
- Context7 `/pinojs/pino` — child logger, levels API
- Context7 `/forwardemail/supertest` — HTTP testing API
- npm registry — all package versions verified 2026-05-06

### Secondary (MEDIUM confidence)
- [Tailscale Funnel docs](https://tailscale.com/docs/features/tailscale-funnel) — Funnel requirements (free plan, HTTPS, CLI commands)
- [Tailscale CLI funnel reference](https://tailscale.com/docs/reference/tailscale-cli/funnel) — `--bg` flag, port restrictions
- WebSearch: "Tailscale Funnel setup requirements HTTPS CLI commands" — cross-verified with docs

### Tertiary (LOW confidence)
- [tsx + PM2 blog post (vramana.com)](https://blog.vramana.com/posts/2023-02-05-pm2-tsx/) — tsx interpreter in PM2 (2023; marked A1 as ASSUMED)

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all versions verified via npm registry
- Architecture: HIGH — Hono and PM2 patterns verified via Context7 official docs
- Pitfalls: MEDIUM — PM2 + caffeinate on macOS from combination of docs + training knowledge
- Tailscale Funnel: MEDIUM — official docs verified; `--bg` reboot persistence is A2 (ASSUMED)

**Research date:** 2026-05-06
**Valid until:** 2026-06-06 (stable libraries — 30 day window)
