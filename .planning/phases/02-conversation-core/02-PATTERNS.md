# Phase 2: Conversation Core - Pattern Map

**Mapped:** 2026-05-06
**Files analyzed:** 10 (4 new, 6 modified)
**Analogs found:** 10 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/core/router.ts` (new) | service | request-response | `src/lib/telegram.ts` | role-match |
| `src/state/conversation.ts` (new) | state/service | CRUD | `src/lib/auth.ts` | partial |
| `src/db/index.ts` (new) | config | CRUD | `src/lib/logger.ts` | role-match |
| `test/conversation.test.ts` (new) | test | CRUD | `test/commands.test.ts` | exact |
| `test/router.test.ts` (new) | test | request-response | `test/commands.test.ts` | exact |
| `src/routes/telegram.ts` (modify) | handler | request-response | self | exact |
| `src/lib/commands.ts` (modify) | controller | request-response | self | exact |
| `src/env.ts` (modify) | config | transform | self | exact |
| `src/types.ts` (modify) | model | N/A | self | exact |
| `vitest.config.ts` (modify) | config | N/A | self | exact |
| `.env.example` (modify) | config | N/A | self | exact |

## Pattern Assignments

### `src/core/router.ts` (new — service, request-response)

**Analog:** `src/lib/telegram.ts`

The model router wraps the Anthropic SDK the same way `telegram.ts` wraps the Telegram Bot API: a module-level constant, exported async functions that accept `env: Env`, and fire-and-forget `Promise<void>` or typed return values.

**Imports pattern** (telegram.ts lines 1-4):
```typescript
import type { Env } from "../types.js";
// Module-level constants for API config
const TG_API = "https://api.telegram.org";
const MAX_CHUNK = 4000;
```

Apply as:
```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "../types.js";
// No module-level singleton — client instantiated per-call with env.ANTHROPIC_API_KEY
```

**Core function pattern** (telegram.ts lines 15-29):
```typescript
export async function tgSend(
  env: Env,
  chatId: number,
  text: string,
  parseMode = "HTML",
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
```

Apply as: `export async function chat(messages, systemPrompt, env): Promise<ChatResult>` with same `env: Env` parameter pattern, typed return value instead of `void`.

**Interface pattern** (types.ts lines 1-6):
```typescript
export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  ALLOWED_USER_ID: string;
  ANTHROPIC_API_KEY: string;
}
```

Apply as: Define `ChatMessage` and `ChatResult` interfaces in `router.ts` (or `types.ts`). Use PascalCase, same style as `TgMessage`, `TgUpdate`.

---

### `src/state/conversation.ts` (new — state/service, CRUD)

**Analog:** `src/lib/auth.ts` (function export pattern) + `src/lib/commands.ts` (multi-function module)

This module exports pure functions that operate on the SQLite DB. No class, no singleton state. Functions accept parameters (chatId, env) and return typed results.

**Function export pattern** (auth.ts lines 1-15):
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

Apply as: Named exports only. Each function does one thing. Import `getDb` from `../db/index.js`. Functions: `loadContext()`, `appendMessages()`, `archiveConversation()`, `getUsage()`, `upsertUsage()`.

**Naming convention:** camelCase function names. Prefix by domain if needed but conversation functions are descriptive enough without a prefix (not `conv` prefixed like `tg` prefix for Telegram).

---

### `src/db/index.ts` (new — config, CRUD)

**Analog:** `src/lib/logger.ts`

A singleton module that exports a getter function for a shared resource. Same pattern as `logger.ts` exporting a configured pino instance.

**Singleton pattern** (logger.ts lines 1-6):
```typescript
import pino from "pino";

export const logger = pino({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  transport: process.env.NODE_ENV !== "production" ? { target: "pino-pretty" } : undefined,
});
```

Apply as: `export function getDb(): Database.Database` with lazy init. Uses `process.env.DB_PATH ?? "data/bot.db"` for test overridability (`:memory:`). Calls `db.pragma("journal_mode = WAL")` and `initSchema(db)` on first access.

---

### `src/routes/telegram.ts` (modify — handler, request-response)

**Analog:** Self (current implementation)

**Integration point** (telegram.ts lines 46-66 — `processUpdate`):
```typescript
async function processUpdate(msg: TgMessage, env: Env): Promise<void> {
  const chatId = msg.chat.id;

  // D-15: Non-text messages -> hint
  if (!msg.text) {
    await tgSend(env, chatId, "Text only for now.");
    return;
  }

  const text = msg.text;

  // INFRA-10: Slash command routing before AI dispatch (D-12, D-13, D-14)
  const handled = await routeCommand(text, chatId, env);
  if (handled) return;

  // INFRA-07: Typing indicator before AI call
  await tgSendChatAction(env, chatId, "typing");

  // D-16: Non-command text -> placeholder response (Phase 1, no AI yet)
  await tgSend(env, chatId, "Received. AI coming soon.");
}
```

Modify: Replace lines 62-65 (typing indicator + placeholder) with:
1. `tgSendChatAction(env, chatId, "typing")`
2. `const messages = loadContext(chatId, resetHourUtc)`
3. `const systemPrompt = buildSystemPrompt()`
4. `const result = await chat(messages, systemPrompt, env)`
5. `appendMessages(chatId, text, result.text, result.inputTokens, result.outputTokens)`
6. `await tgSend(env, chatId, result.text)`

**Error handling pattern** (telegram.ts lines 35-41):
```typescript
setImmediate(() => {
    processUpdate(msg!, env).catch((err: unknown) => {
      // INFRA-11: log error type only, send generic message to user
      logger.error({ type: (err as Error).constructor?.name ?? "Unknown" }, "processUpdate failed");
      tgSend(env, chatId, "Something failed.").catch(() => undefined);
    });
  });
```

This catch already covers Claude API errors. No change needed to error handling.

---

### `src/lib/commands.ts` (modify — controller, request-response)

**Analog:** Self (current implementation)

**Command registration pattern** (commands.ts lines 6-9):
```typescript
const commands = new Map<string, CommandHandler>([
  ["help", handleHelp],
  ["ping", handlePing],
]);
```

Add entries: `["reset", handleReset]`, `["status", handleStatus]`.

**Command handler pattern** (commands.ts lines 20-30):
```typescript
async function handlePing(chatId: number, env: Env): Promise<void> {
  await tgSend(env, chatId, "pong");
}

async function handleHelp(chatId: number, env: Env): Promise<void> {
  await tgSend(
    env,
    chatId,
    "<b>Commands</b>\n/ping — confirm bot is alive\n/help — show this message",
  );
}
```

Apply as: `handleReset` calls `archiveConversation(chatId)` then `tgSend(env, chatId, "Conversation cleared.")`. `handleStatus` queries SQLite via state functions, formats HTML with `<b>`, `<code>` tags, sends via `tgSend`. Both follow same signature: `(chatId: number, env: Env): Promise<void>`.

**Help message update:** Add `/reset` and `/status` to the help text.

---

### `src/env.ts` (modify — config, transform)

**Analog:** Self

**Env bridge pattern** (env.ts lines 1-10):
```typescript
import type { Env } from "./types.js";

export function getEnv(): Env {
  return {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? "",
    TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET ?? "",
    ALLOWED_USER_ID: process.env.ALLOWED_USER_ID ?? "",
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
  };
}
```

Add: `DEFAULT_MODEL: process.env.DEFAULT_MODEL ?? ""`, `RESET_HOUR_UTC: process.env.RESET_HOUR_UTC ?? ""`.

---

### `src/types.ts` (modify — model)

**Analog:** Self

**Interface extension pattern** (types.ts lines 1-6):
```typescript
export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  ALLOWED_USER_ID: string;
  ANTHROPIC_API_KEY: string;
}
```

Add: `DEFAULT_MODEL: string;`, `RESET_HOUR_UTC: string;`.

---

### `test/conversation.test.ts` (new — test, CRUD)

**Analog:** `test/commands.test.ts`

**Test file structure** (commands.test.ts lines 1-22):
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env } from "../src/types.js";

vi.mock("../src/lib/telegram.js", () => ({
  tgSend: vi.fn().mockResolvedValue(undefined),
}));

import { routeCommand } from "../src/lib/commands.js";
import { tgSend } from "../src/lib/telegram.js";

function makeEnv(): Env {
  return {
    TELEGRAM_BOT_TOKEN: "bot-token",
    TELEGRAM_WEBHOOK_SECRET: "correct-secret",
    ALLOWED_USER_ID: "12345",
    ANTHROPIC_API_KEY: "anthropic-key",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});
```

Apply as: Import conversation state functions directly (no mock needed — test with `:memory:` DB). Use `makeEnv()` helper with additional fields (`DEFAULT_MODEL`, `RESET_HOUR_UTC`). Test `loadContext`, `appendMessages`, `archiveConversation`, `getUsage`, daily reset logic.

**DB test override:** `vitest.config.ts` env block gets `DB_PATH: ":memory:"` so `getDb()` uses in-memory SQLite.

---

### `test/router.test.ts` (new — test, request-response)

**Analog:** `test/commands.test.ts`

**Mock pattern for external SDK** (commands.test.ts lines 4-8):
```typescript
vi.mock("../src/lib/telegram.js", () => ({
  tgSend: vi.fn().mockResolvedValue(undefined),
}));
```

Apply as: Mock `@anthropic-ai/sdk` to intercept `messages.create()`. Verify `chat()` passes correct `model`, `system`, `messages` params. Verify return shape `{ text, inputTokens, outputTokens }`.

**Assertion pattern** (commands.test.ts lines 36-41):
```typescript
it("handles /ping and sends pong", async () => {
    expect(await routeCommand("/ping", 123, makeEnv())).toBe(true);
    expect(tgSend).toHaveBeenCalledWith(
      expect.objectContaining({ TELEGRAM_BOT_TOKEN: "bot-token" }),
      123,
      "pong",
    );
  });
```

Apply as: Assert `chat()` returns expected `ChatResult`, verify Anthropic SDK was called with correct params via mock spy.

---

### `vitest.config.ts` (modify — config)

**Analog:** Self

**Env block pattern** (vitest.config.ts lines 6-13):
```typescript
env: {
      TELEGRAM_BOT_TOKEN: "test-bot-token",
      TELEGRAM_WEBHOOK_SECRET: "test-secret",
      ALLOWED_USER_ID: "12345",
      ANTHROPIC_API_KEY: "test-anthropic-key",
      NODE_ENV: "test",
      PORT: "0",
    },
```

Add: `DB_PATH: ":memory:"`, `DEFAULT_MODEL: "claude-haiku-4-5-20251001"`, `RESET_HOUR_UTC: "21"`.

---

### `.env.example` (modify — config)

**Analog:** Self

**Current format** (.env.example lines 1-11):
```
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

Add under `# Anthropic`:
```
DEFAULT_MODEL=claude-haiku-4-5-20251001
RESET_HOUR_UTC=21
```

---

## Shared Patterns

### Import Style
**Source:** All `src/` files
**Apply to:** All new files
```typescript
// Relative paths with .js extension. Type-only imports use `import type`.
import type { Env } from "../types.js";
import { tgSend } from "./telegram.js";
```

### Error Handling (Handler Layer)
**Source:** `src/routes/telegram.ts` lines 35-41
**Apply to:** `processUpdate` — no change needed; existing catch covers new Claude errors
```typescript
logger.error({ type: (err as Error).constructor?.name ?? "Unknown" }, "processUpdate failed");
tgSend(env, chatId, "Something failed.").catch(() => undefined);
```

### Error Handling (Core Layer)
**Source:** `src/lib/telegram.ts` (implicit — no try/catch, lets errors bubble)
**Apply to:** `src/core/router.ts`

Core functions do NOT catch errors themselves. They let errors bubble up to the handler's catch block. This matches `tgSend` which also has no try/catch — it lets fetch errors propagate.

Exception: validate `env.ANTHROPIC_API_KEY` is non-empty before creating client (Pitfall 3 from RESEARCH.md). Throw early with descriptive error.

### Function Signature Convention
**Source:** `src/lib/telegram.ts`, `src/lib/auth.ts`
**Apply to:** All new functions
```typescript
// env: Env passed as parameter (not global). Named exports only.
export async function tgSend(env: Env, chatId: number, text: string): Promise<void>
export function checkWebhookSignature(req: Request, env: Env): Response | null
```

### Test Helpers
**Source:** `test/auth.test.ts` lines 5-13, `test/commands.test.ts` lines 11-18
**Apply to:** All new test files
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

Update `makeEnv` in new tests to include `DEFAULT_MODEL` and `RESET_HOUR_UTC`.

### Mock Pattern
**Source:** `test/commands.test.ts` lines 4-8, `test/routes.test.ts` lines 6-20
**Apply to:** All new test files needing mocks
```typescript
// vi.mock BEFORE imports. Mock at module boundary.
vi.mock("../src/lib/telegram.js", () => ({
  tgSend: vi.fn().mockResolvedValue(undefined),
}));

// Mock logger to prevent pino-pretty transport issues
vi.mock("../src/lib/logger.js", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));
```

### HTML Formatting for Telegram
**Source:** `src/lib/commands.ts` lines 24-29
**Apply to:** `/status` handler, system prompt design
```typescript
// Use HTML tags: <b>, <i>, <code>, <pre>. Never Markdown.
await tgSend(
    env,
    chatId,
    "<b>Commands</b>\n/ping — confirm bot is alive\n/help — show this message",
  );
```

### Logging Convention
**Source:** `src/routes/telegram.ts` line 38, `src/lib/logger.ts`
**Apply to:** Any new error logging in core/state layers
```typescript
// Import logger, log type only — never content
import { logger } from "./logger.js";
logger.error({ type: "AnthropicError" }, "Claude API call failed");
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/state/conversation.ts` | state | CRUD | No state layer exists yet. First SQLite-backed module. Schema and query patterns come from RESEARCH.md (better-sqlite3 examples). |
| `src/db/index.ts` | config | CRUD | No database module exists yet. Singleton pattern borrowed from `logger.ts` but DB init + schema creation is novel. Pattern comes from RESEARCH.md. |

These two files have no direct analog for their SQLite-specific patterns. Planner should use RESEARCH.md Pattern 1 (SQLite Schema) and Pattern 3 (Conversation Context Load) as the primary reference.

---

## Metadata

**Analog search scope:** `src/`, `test/`
**Files scanned:** 13 source + test files
**Pattern extraction date:** 2026-05-06
