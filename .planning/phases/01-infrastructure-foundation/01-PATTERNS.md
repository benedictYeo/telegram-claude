# Phase 1: Infrastructure Foundation - Pattern Map

**Mapped:** 2026-05-06
**Files analyzed:** 12 new/modified files
**Analogs found:** 9 / 12

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/index.ts` | entry / router | request-response | `src/index.ts` (current) | rewrite of same file |
| `src/types.ts` | type definitions | — | `src/types.ts` (current) | port-as-is (trim KV namespaces) |
| `src/routes/telegram.ts` | handler | request-response | `src/handlers/telegram.ts` (current) | exact |
| `src/lib/auth.ts` | middleware / utility | request-response | `src/core/auth.ts` (current) | exact |
| `src/lib/telegram.ts` | utility / API client | request-response | `src/core/telegram.ts` (current) | exact |
| `src/lib/commands.ts` | utility / router | request-response | none | no analog |
| `src/lib/logger.ts` | utility | — | none | no analog |
| `ecosystem.config.cjs` | config | — | none | no analog |
| `.env.example` | config | — | none | no analog |
| `test/routes.test.ts` | test | request-response | `test/auth.test.ts` (current) | role-match |
| `test/commands.test.ts` | test | request-response | `test/auth.test.ts` (current) | role-match |
| `test/errors.test.ts` | test | — | `test/chunking.test.ts` (current) | role-match |

---

## Pattern Assignments

### `src/index.ts` (entry / router)

**Analog:** `src/index.ts` (current — CF Workers entry)

This file is a complete rewrite: replace `export default { fetch() }` with Hono app + `serve()`. The routing logic (POST /webhook, GET /health, 404 catch-all) transfers directly.

**Imports pattern** (current lines 1-2 — adapt to Hono):
```typescript
import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import type { Env } from "./types.js";
import { handleTelegramWebhook } from "./routes/telegram.js";
```

**Entry point pattern** (current lines 4-22 — adapt):
```typescript
// Current CF Workers export default { fetch() } pattern:
export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname === "/webhook") {
      return handleTelegramWebhook(req, env, ctx);
    }
    if (req.method === "GET" && url.pathname === "/health") {
      return new Response("ok");
    }
    return new Response("not found", { status: 404 });
  },
};

// Replace with Hono pattern (from RESEARCH.md Pattern 1):
const app = new Hono<{ Bindings: Env }>();
app.get("/health", (c) => c.text("ok"));
app.post("/webhook", handleTelegramWebhook);
app.all("*", (c) => c.text("not found", 404));

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) });
```

**Key change:** `dotenv/config` must be the first import (RESEARCH.md Pitfall 5). Remove `scheduled()` stub — no cron in Phase 1.

---

### `src/types.ts` (type definitions)

**Analog:** `src/types.ts` (current — port with minimal changes)

**Full current file** (lines 1-45 — carry forward, trim CF Worker bindings):
```typescript
// KEEP as-is:
export interface TgUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

export interface TgChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
}

export interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  date: number;
  text?: string;
}

export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

// REPLACE Env: remove KVNamespace (no KV in Node.js), remove WEBHOOK_SECRET (Phase 6):
export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  ALLOWED_USER_ID: string;
  ANTHROPIC_API_KEY: string;   // Phase 2 — keep in type, .env.example documents it
}
```

**Note:** In Hono + Node.js, `Env` is used as `Hono<{ Bindings: Env }>`. `c.env` reads from `process.env`. No `KVNamespace` type needed — remove `@cloudflare/workers-types` from tsconfig.

---

### `src/routes/telegram.ts` (handler, request-response)

**Analog:** `src/handlers/telegram.ts` (current — exact match)

**Full current analog** (lines 1-34):
```typescript
import type { Env, TgUpdate } from "../types.js";
import { checkWebhookSignature, checkUserAllowed } from "../core/auth.js";
import { tgSend } from "../core/telegram.js";

export async function handleTelegramWebhook(
  req: Request,
  env: Env,
  _ctx: ExecutionContext
): Promise<Response> {
  const authFail = checkWebhookSignature(req, env);
  if (authFail) return authFail;

  let update: TgUpdate;
  try {
    update = await req.json<TgUpdate>();
  } catch {
    return new Response("ok");
  }

  if (!checkUserAllowed(update, env)) {
    // Silent drop — no log, no error
    return new Response("ok");
  }

  const msg = update.message;
  if (!msg?.text) return new Response("ok");

  const chatId = msg.chat.id;
  const text = msg.text;

  await tgSend(env, chatId, text);

  return new Response("ok");
}
```

**Adaptations required for Hono:**
- Function signature changes from `(req: Request, env: Env, _ctx: ExecutionContext)` to `(c: Context<{ Bindings: Env }>)`
- Body parse changes from `req.json<TgUpdate>()` to `c.req.json<TgUpdate>()`
- Returns change from `new Response("ok")` to `c.text("ok")`
- Auth calls change from `checkWebhookSignature(req, env)` to `checkWebhookSignature(c.req.raw, c.env)`
- Echo replaced with command dispatch (D-12 to D-16): slash commands → `routeCommand()`, non-text → "Text only for now.", plain text → "Received. AI coming soon."
- Ack-and-defer: wrap `processUpdate` in `setImmediate()` before `return c.text("ok")` (RESEARCH.md Pattern 2)

**Ack-and-defer adaptation** (from RESEARCH.md Pattern 2):
```typescript
// Schedule async work AFTER response
setImmediate(() => {
  processUpdate(body, c.env).catch((err: unknown) => {
    logger.error({ type: (err as Error).constructor.name }, "processUpdate failed");
  });
});

return c.text("ok");
```

---

### `src/lib/auth.ts` (middleware / utility, request-response)

**Analog:** `src/core/auth.ts` (current — port as-is, zero logic changes)

**Full current analog** (lines 1-15):
```typescript
import type { Env, TgUpdate } from "../types.js";

export function checkWebhookSignature(req: Request, env: Env): Response | null {
  const sig = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (sig !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  return null;
}

export function checkUserAllowed(update: TgUpdate, env: Env): boolean {
  const fromId = update.message?.from?.id ?? update.callback_query?.from?.id;
  if (fromId === undefined) return false;
  return String(fromId) === env.ALLOWED_USER_ID;
}
```

**Import path change only:** `"../types.js"` stays identical. Copy verbatim from `src/core/auth.ts`, adjust import path to `"../types.js"` (same relative depth from `src/lib/`).

**Guard pattern** (lines 3-9): `Response | null` return — null means pass, non-null means failed. This pattern is preserved exactly.

---

### `src/lib/telegram.ts` (utility / API client, request-response)

**Analog:** `src/core/telegram.ts` (current — port as-is, zero logic changes)

**Full current analog** (lines 1-41):
```typescript
import type { Env } from "../types.js";

const TG_API = "https://api.telegram.org";
const MAX_CHUNK = 4000;

export function chunkMessage(text: string, max = MAX_CHUNK): string[] {
  if (text.length === 0) return [""];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += max) {
    chunks.push(text.slice(i, i + max));
  }
  return chunks;
}

export async function tgSend(
  env: Env,
  chatId: number,
  text: string,
  parseMode = "HTML"
): Promise<void> {
  const chunks = chunkMessage(text);
  for (const chunk of chunks) {
    await fetch(`${TG_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: parseMode }),
    });
  }
}

export async function tgSendChatAction(
  env: Env,
  chatId: number,
  action: "typing" | "upload_document" | "find_location"
): Promise<void> {
  await fetch(`${TG_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action }),
  });
}
```

Copy verbatim. `fetch` is available globally in Node.js 18+. Import path `"../types.js"` stays identical. No changes needed.

---

### `src/lib/commands.ts` (utility / router, request-response)

**Analog:** None — no command router exists in the codebase.

Use RESEARCH.md Pattern 4 as the blueprint:

**Command handler type and registry** (from RESEARCH.md Pattern 4):
```typescript
import type { Env } from "../types.js";
import { tgSend } from "./telegram.js";

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
  if (!handler) return false; // D-14: unrecognized commands pass through
  await handler(chatId, env);
  return true;
}
```

**Individual command handlers** (implement per D-12):
```typescript
async function handlePing(chatId: number, env: Env): Promise<void> {
  await tgSend(env, chatId, "pong");
}

async function handleHelp(chatId: number, env: Env): Promise<void> {
  await tgSend(env, chatId, "<b>Commands</b>\n/ping — confirm bot is alive\n/help — show this message");
}
```

**Conventions to follow:** Named exports only. `env: Env` as second parameter on every handler. `tgSend` with default `parseMode = "HTML"` — no explicit parse_mode arg needed.

---

### `src/lib/logger.ts` (utility)

**Analog:** None — no logger module exists in the codebase (CF Workers used Observability, not pino).

Use RESEARCH.md pino pattern:

```typescript
import pino from "pino";

export const logger = pino({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  transport: process.env.NODE_ENV !== "production"
    ? { target: "pino-pretty" }
    : undefined,
});
```

**Error logging convention** (RESEARCH.md INFRA-11 + CLAUDE.md hard rule):
```typescript
// Log type only — never log message content or payloads
logger.error({ type: (err as Error).constructor.name }, "processUpdate failed");
```

**Naming:** Single export `logger`. Import as `import { logger } from "./logger.js"` in other modules.

---

### `ecosystem.config.cjs` (config)

**Analog:** None — no PM2 config exists in the codebase.

Use RESEARCH.md Pattern 3 verbatim:

```javascript
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
      script: "/usr/bin/caffeinate",
      interpreter: "none",
      args: "-s",
      autorestart: true,
    },
  ],
};
```

**Note:** `.cjs` extension required — PM2 does not support ESM ecosystem files (RESEARCH.md Pattern 3). `interpreter: "none"` required for caffeinate (RESEARCH.md Pitfall 2).

---

### `.env.example` (config)

**Analog:** None — no `.env.example` exists. No secrets file in the current codebase (CF Workers used `wrangler secret put`).

Template to commit (actual `.env` is gitignored per D-10):

```bash
# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
ALLOWED_USER_ID=

# Anthropic (Phase 2)
ANTHROPIC_API_KEY=

# Server
PORT=3000
NODE_ENV=production
```

---

### `test/routes.test.ts` (test, request-response)

**Analog:** `test/auth.test.ts` (current — role-match for test structure)

**Test structure pattern** (current `test/auth.test.ts` lines 1-16 — adapt):
```typescript
import { describe, it, expect } from "vitest";
// Auth test uses direct function imports — routes test needs supertest

import supertest from "supertest";
import { createServer } from "http";
import { handle } from "@hono/node-server/handler";
// import app from "../src/index.js";   // Hono app exported (not default worker)
```

**Supertest server factory** (RESEARCH.md Code Examples):
```typescript
const server = createServer(handle(app));
const req = supertest(server);

describe("GET /health", () => {
  it("returns 200", async () => {
    await req.get("/health").expect(200);
  });
});
```

**Env mocking pattern** (from `test/auth.test.ts` lines 5-16 — adapt for Hono):
```typescript
// Current pattern: makeEnv() helper for direct function calls
function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    TELEGRAM_BOT_TOKEN: "bot-token",
    TELEGRAM_WEBHOOK_SECRET: "correct-secret",
    ALLOWED_USER_ID: "12345",
    ANTHROPIC_API_KEY: "anthropic-key",
    ...overrides,
  };
}
// For Hono integration tests: set process.env before creating app,
// or pass env vars via supertest headers
```

**describe/it/expect** pattern from `test/auth.test.ts`: no beforeAll/afterAll, stateless — follow same style for routes tests.

---

### `test/commands.test.ts` (test, request-response)

**Analog:** `test/auth.test.ts` (current — role-match; tests pure exported functions)

**Pattern** (same structure as `test/auth.test.ts`):
```typescript
import { describe, it, expect, vi } from "vitest";
import { routeCommand } from "../src/lib/commands.js";
import type { Env } from "../src/types.js";

// Mock tgSend to capture calls without real HTTP
vi.mock("../src/lib/telegram.js", () => ({
  tgSend: vi.fn().mockResolvedValue(undefined),
}));
```

**Test cases to cover:** D-12 (/ping returns pong, /help returns command list), D-13 (Map registry), D-14 (unrecognized command returns false, does not send), D-15 (non-text messages), D-16 (plain text placeholder).

---

### `test/errors.test.ts` (test)

**Analog:** `test/chunking.test.ts` (current — role-match; unit tests of pure utility behavior)

**Structure pattern** (current `test/chunking.test.ts` lines 1-3):
```typescript
import { describe, it, expect } from "vitest";
// No mocking needed for chunking — pure function
// errors.test.ts will mock tgSend + logger to verify error path behavior
```

Tests cover INFRA-11: error in processUpdate sends generic message to user, logs `{ type: err.constructor.name }` only (never message content).

---

## Shared Patterns

### Auth Guard (two-layer)
**Source:** `src/core/auth.ts` lines 1-15
**Apply to:** `src/routes/telegram.ts`

```typescript
// Layer 1: Webhook signature → 401 on fail
const authFail = checkWebhookSignature(c.req.raw, c.env);
if (authFail) return authFail;

// Layer 2: User ID allowlist → silent 200 drop
if (!checkUserAllowed(update, c.env)) {
  // Silent drop — no log, no error
  return c.text("ok");
}
```

### Error Handling (user-facing)
**Source:** RESEARCH.md INFRA-11 + CLAUDE.md hard rules
**Apply to:** `src/routes/telegram.ts` (processUpdate catch), `src/lib/commands.ts` (individual command handlers)

```typescript
.catch((err: unknown) => {
  logger.error({ type: (err as Error).constructor.name }, "processUpdate failed");
  tgSend(env, chatId, "Something failed.").catch(() => undefined);
});
```

**Rules:** Generic message to user. Real error logged by type only — never content, never payload.

### Telegram API Calls
**Source:** `src/core/telegram.ts` lines 15-41
**Apply to:** All files that send messages (`src/lib/commands.ts`, `src/routes/telegram.ts`)

```typescript
// Always import tgSend and tgSendChatAction — never call fetch directly for Telegram
import { tgSend, tgSendChatAction } from "./telegram.js";

// Always HTML parse mode (default) — never pass "MarkdownV2"
await tgSend(env, chatId, "message text");  // parseMode defaults to "HTML"
```

### Import Style
**Source:** All current `src/` files
**Apply to:** All new files

```typescript
// .js extension on all local imports (ES module bundler resolution)
import type { Env } from "../types.js";
import { tgSend } from "./telegram.js";

// type keyword for type-only imports
import type { Context } from "hono";

// dotenv/config first, before any other imports, in src/index.ts only
import "dotenv/config";
```

### JSON Parse Safety
**Source:** `src/handlers/telegram.ts` lines 14-18
**Apply to:** `src/routes/telegram.ts`

```typescript
let update: TgUpdate;
try {
  update = await c.req.json<TgUpdate>();
} catch {
  return c.text("ok");
}
```

### Test Env Helper
**Source:** `test/auth.test.ts` lines 5-16
**Apply to:** All test files that need `Env`

```typescript
function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    TELEGRAM_BOT_TOKEN: "bot-token",
    TELEGRAM_WEBHOOK_SECRET: "correct-secret",
    ALLOWED_USER_ID: "12345",
    ANTHROPIC_API_KEY: "anthropic-key",
    ...overrides,
  };
}
```

---

## No Analog Found

Files with no close match in the codebase (planner should use RESEARCH.md patterns):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/lib/commands.ts` | utility / router | request-response | No command routing exists yet — all messages echoed in current code |
| `src/lib/logger.ts` | utility | — | No logger module — CF Workers used platform Observability, not pino |
| `ecosystem.config.cjs` | config | — | No PM2 config — CF Workers used wrangler.toml |
| `.env.example` | config | — | No .env pattern — CF Workers used wrangler secret put |

---

## Config File Changes

### `tsconfig.json` (modify existing)

**Current:** `"types": ["@cloudflare/workers-types"]`, `"moduleResolution": "bundler"`

**Required changes:**
- Remove `"@cloudflare/workers-types"` from types array (CF Workers-specific)
- Add `"@types/node"` to types (for `process`, `setImmediate`, etc.)
- Keep `"strict": true`, `"target": "ES2022"`, `"module": "ES2022"`, `"noEmit": true`
- Keep `"include": ["src/**/*.ts", "test/**/*.ts"]`

### `vitest.config.ts` (keep as-is)

Current config (`environment: "node"`) is already correct for Phase 1. No changes needed.

### `package.json` (modify existing)

Add new dependencies per RESEARCH.md Standard Stack. Keep existing scripts. Remove `@cloudflare/vitest-pool-workers` and `wrangler` from devDependencies (no longer needed for Phase 1 target).

---

## Metadata

**Analog search scope:** `/Users/benedictyeo/GitHub/telegram-claude/src/`, `/Users/benedictyeo/GitHub/telegram-claude/test/`
**Files scanned:** 7 source files + 3 config files
**Pattern extraction date:** 2026-05-06
