# Phase 2: Conversation Core - Research

**Researched:** 2026-05-06
**Domain:** Anthropic Messages API, better-sqlite3 conversation persistence, model router abstraction
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-02:** Daily reset at 5am SGT. `RESET_HOUR_UTC` env var (default: `21`). Schedule-based, not TTL.
- **D-03:** Full message storage in SQLite — role, content, timestamp, token count per message.
- **D-04:** Silent fresh start after daily reset. No announcement.
- **D-05:** `/reset` is the only manual clear command.
- **D-06:** Soft delete (archive) at daily reset. Messages marked `archived=1`, not deleted.
- **D-07:** No continuation indicator on chunked messages — send sequentially.
- **D-08:** Concise + direct personality. Short sentences, no filler.
- **D-09:** Progressive system prompt. Start minimal in Phase 2; each phase appends.
- **D-10:** Telegram-aware prompt — references Telegram interface, HTML formatting, concise responses.
- **D-11:** Inject current date/time (SGT) into system prompt on each call.
- **D-12:** `/status` shows today's token count (input + output) and current model name.
- **D-13:** Token counts persist across daily resets. `/status` shows today AND cumulative total.
- **D-14:** `/status` includes conversation turn count and last message time.
- **D-15:** Default model: `claude-haiku-4-5-20251001`. Fast and cheap.
- **D-16:** Model configurable via `DEFAULT_MODEL` env var.
- **D-17:** Wire extended thinking infrastructure now, disabled by default.
- **D-18:** Non-streaming API calls. Single call, full response.

### Claude's Discretion

- **D-01:** Memory trim strategy — rolling window vs token-counted trim. Pick what fits model context + simplicity.
- **D-19:** Formatting approach — instruct Claude API to output HTML directly, or convert markdown to HTML in code.
- **D-20:** Model router abstraction level — minimum viable abstraction that doesn't block Phase 3.

### Deferred Ideas (OUT OF SCOPE)

- System prompt from Obsidian vault (requires Phase 4)
- Reminder functionality (requires Phase 7)
- Extended thinking for complex queries (deferred to Phase 3)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONV-01 | Multi-turn conversation with rolling context window | Anthropic Messages API accepts `messages[]` array; load from SQLite on each call |
| CONV-02 | Conversation state persisted in SQLite with 24h TTL | `better-sqlite3` schema with `created_at` timestamp; daily reset clears active context |
| CONV-03 | `/reset` command clears conversation history | Soft-delete (archive flag) in SQLite; new conversation ID issued |
| CONV-04 | Token tracking per conversation (daily usage via `/status`) | `usage.input_tokens` + `usage.output_tokens` from Anthropic response; stored per message |
| LLM-01 | Model router abstraction — handlers never call provider SDKs directly | `src/core/router.ts` wrapper; handler calls `router.chat()`, not `anthropic.messages.create()` |
| LLM-02 | Claude support via Anthropic SDK | `@anthropic-ai/sdk` `messages.create()` inside router; SDK v0.94.0 verified |
</phase_requirements>

---

## Summary

Phase 2 replaces the `"Received. AI coming soon."` placeholder with real Claude multi-turn conversation. The three pillars are: (1) Anthropic SDK integration for LLM calls, (2) SQLite persistence for conversation history and token tracking, and (3) a thin model router abstraction so Phase 3 can add OpenAI/Ollama without touching handler code.

The stack is already largely in place from Phase 1: `better-sqlite3` is installed (v12.9.0), `@anthropic-ai/sdk` is not yet installed (needs `npm install`). The ack-and-defer pattern (`setImmediate` in `processUpdate`) already handles the non-blocking requirement — the Claude call goes inside `processUpdate`, which runs after the 200 ack.

`claude-haiku-4-5-20251001` is confirmed as a valid model ID. It supports extended thinking (up to 64k output tokens) and has a 200k context window, making a rolling-window trim strategy straightforward.

**Primary recommendation:** Install `@anthropic-ai/sdk`, create `src/state/conversation.ts` for SQLite read/write, create `src/core/router.ts` as the provider abstraction, wire both into the existing `processUpdate` flow, and add `/reset` + `/status` to the commands Map.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| LLM API calls | Core layer (`src/core/router.ts`) | — | Handlers must not call SDKs directly (LLM-01) |
| Conversation persistence | State layer (`src/state/conversation.ts`) | — | KV-style read/write abstraction over SQLite |
| Token tracking | State layer (`src/state/conversation.ts`) | — | Token counts stored alongside messages |
| Daily reset detection | State layer on each processUpdate | — | Check timestamp on context load, not cron |
| System prompt assembly | Core layer (`src/core/router.ts` or helper) | — | Assembled per-call with injected date/time |
| Typing indicator | Existing `tgSendChatAction` | — | Already wired in `processUpdate` |
| Command routing | Existing `src/lib/commands.ts` | — | Add `/reset`, `/status` entries to Map |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/sdk` | 0.94.0 | Anthropic Messages API client | Official SDK; typed params/responses; handles retries |
| `better-sqlite3` | 12.9.0 | SQLite persistence | Already installed (Phase 1 D-17); synchronous API fits Node |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `dotenv` | 17.4.2 | Env loading | Already installed; no change needed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@anthropic-ai/sdk` | Raw `fetch` to Anthropic API | SDK gives typed responses, retry logic, and future streaming support at zero cost. CLAUDE.md exempts it from the "no-library" rule explicitly. |
| SQLite rolling window | In-memory array | SQLite survives restarts; required for CONV-02 (24h persistence) |
| Soft delete (archive) | Hard delete | D-06 locked: archive for future search/export |

**Installation:**
```bash
npm install @anthropic-ai/sdk
```

**Version verification:** `npm view @anthropic-ai/sdk version` returned `0.94.0` on 2026-05-06. [VERIFIED: npm registry]

---

## Architecture Patterns

### System Architecture Diagram

```
Telegram webhook POST /webhook
        |
        v
telegramWebhook() [src/routes/telegram.ts]
  - Auth gate (signature + user ID)
  - Return 200 immediately (ack)
        |
        v (setImmediate — after ack)
processUpdate(msg, env)
  - Route /reset, /status, /ping, /help -> commands Map
  - Non-command text:
      |
      +--> tgSendChatAction("typing")
      |
      +--> conversation.loadContext(chatId)  [SQLite read]
      |        - Check daily reset (timestamp comparison)
      |        - If reset due: archive old messages
      |        - Return messages[] for API call
      |
      +--> router.chat(messages, systemPrompt, env)  [Core layer]
      |        - Anthropic SDK: messages.create()
      |        - Returns { text, inputTokens, outputTokens }
      |
      +--> conversation.appendMessages(chatId, userMsg, assistantMsg, tokens)  [SQLite write]
      |
      +--> tgSend(env, chatId, responseText)  [chunked at 4000 chars]
```

### Recommended Project Structure

New files for Phase 2:

```
src/
├── core/
│   └── router.ts         # Model router abstraction (LLM-01, LLM-02)
├── state/
│   └── conversation.ts   # SQLite read/write for messages + token tracking
├── db/
│   └── index.ts          # Database singleton + schema init
data/
└── bot.db                # SQLite file (gitignored, path from Phase 1 D-23)
```

Modifications to existing files:

```
src/
├── routes/telegram.ts    # Replace placeholder with router.chat() call
├── lib/commands.ts       # Add /reset, /status handlers
├── env.ts                # Add ANTHROPIC_API_KEY, DEFAULT_MODEL, RESET_HOUR_UTC
├── types.ts              # Add DEFAULT_MODEL, RESET_HOUR_UTC to Env
.env.example              # Add DEFAULT_MODEL, RESET_HOUR_UTC
```

### Pattern 1: SQLite Schema

**What:** Three tables — `conversations` (active/archived state), `messages` (full history), `daily_usage` (token tracking per day).
**When to use:** Always; created on first startup via `db.exec()`.

```typescript
// Source: verified via Context7 /wiselibs/better-sqlite3
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.resolve("data/bot.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    initSchema(_db);
  }
  return _db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id),
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      input_tokens INTEGER,
      output_tokens INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_usage (
      date TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (date)
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_chat ON conversations(chat_id, archived);
  `);
}
```

### Pattern 2: Model Router Abstraction (LLM-01)

**What:** A single function `chat()` that handlers call. Implementation detail (Anthropic SDK) is hidden.
**When to use:** All LLM calls go through the router — never direct SDK calls in handlers.

```typescript
// Source: Anthropic SDK docs via Context7 /anthropics/anthropic-sdk-typescript
import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "../types.js";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export async function chat(
  messages: ChatMessage[],
  systemPrompt: string,
  env: Env,
): Promise<ChatResult> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const model = env.DEFAULT_MODEL || "claude-haiku-4-5-20251001";

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages,
    // Extended thinking infrastructure — disabled by default (D-17)
    // thinking: { type: "enabled", budget_tokens: 2000 },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return {
    text: textBlock?.type === "text" ? textBlock.text : "",
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
```

### Pattern 3: Conversation Context Load with Daily Reset

**What:** Load active conversation messages for a chat_id; detect and apply daily reset if due.
**When to use:** Every `processUpdate` call for non-command text.

```typescript
// Source: verified via Context7 /wiselibs/better-sqlite3
export function loadContext(chatId: number, resetHourUtc: number): ChatMessage[] {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const todayResetTs = getDailyResetTimestamp(resetHourUtc);

  const conv = db
    .prepare(
      `SELECT id, created_at FROM conversations
       WHERE chat_id = ? AND archived = 0
       ORDER BY id DESC LIMIT 1`,
    )
    .get(chatId) as { id: number; created_at: number } | undefined;

  if (conv && conv.created_at < todayResetTs) {
    // Archive the conversation — silent per D-04
    db.prepare("UPDATE conversations SET archived = 1 WHERE id = ?").run(conv.id);
    return [];
  }

  if (!conv) return [];

  const rows = db
    .prepare(
      `SELECT role, content FROM messages
       WHERE conversation_id = ?
       ORDER BY id ASC`,
    )
    .all(conv.id) as ChatMessage[];

  return rows;
}

function getDailyResetTimestamp(resetHourUtc: number): number {
  const now = new Date();
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), resetHourUtc, 0, 0));
  if (reset.getTime() > Date.now()) {
    reset.setUTCDate(reset.getUTCDate() - 1);
  }
  return Math.floor(reset.getTime() / 1000);
}
```

### Pattern 4: System Prompt Assembly

**What:** Build system prompt string with date injection (D-11) and Telegram-awareness (D-10).
**When to use:** Before every `router.chat()` call.

```typescript
// Source: [ASSUMED] — standard pattern, no external reference needed
export function buildSystemPrompt(): string {
  const now = new Date();
  const sgtOffset = 8 * 60; // UTC+8
  const sgt = new Date(now.getTime() + sgtOffset * 60 * 1000);
  const dateStr = sgt.toISOString().replace("T", " ").substring(0, 16) + " SGT";

  return [
    "You are a sharp technical co-pilot accessible via Telegram.",
    "Keep responses concise and formatted for a chat interface.",
    "Use HTML formatting only: <b>, <i>, <code>, <pre>. Never use Markdown.",
    "Short sentences. Direct answers. No filler.",
    `Current date and time: ${dateStr}.`,
  ].join(" ");
}
```

### Pattern 5: D-01 Rolling Window (Claude's Discretion — Recommended)

**What:** Keep the last N messages by count, not by token-counted trim.
**Why recommended:** Simpler to implement; Haiku 4.5 has 200k context so count-based trim (e.g., last 40 messages) is safe. Token-counted trim requires a separate `countTokens` API call per load.
**Threshold:** 40 messages (20 turns) is a sensible default. Configurable via constant.

```typescript
const MAX_CONTEXT_MESSAGES = 40;

// After loading, trim to last N if needed
const trimmed = rows.slice(-MAX_CONTEXT_MESSAGES);
```

### Pattern 6: D-19 Formatting Approach (Claude's Discretion — Recommended)

**What:** Instruct Claude to output HTML directly in the system prompt.
**Why recommended:** Avoids a markdown-to-HTML conversion layer (extra code, edge cases with nested elements). Claude follows formatting instructions reliably when the system prompt is explicit. Telegram's HTML parse mode accepts: `<b>`, `<i>`, `<code>`, `<pre>`, `<a>`.
**Risk:** Claude occasionally uses unsupported tags. Mitigation: system prompt enumerates the allowed set explicitly.

### Anti-Patterns to Avoid

- **Anthropic client per message:** Instantiate `new Anthropic()` once per router call, not as a module-level singleton — the API key is passed at runtime via `env`. [ASSUMED]
- **Blocking webhook:** Never `await router.chat()` before returning 200. The `setImmediate` ack pattern from Phase 1 already prevents this.
- **Markdown parse mode:** Hard rule from CLAUDE.md — HTML only, never MarkdownV2.
- **Logging response content:** Log `{ type: "ClaudeCallFailed" }` on error, never log the actual message content or response.
- **Hard-deleting messages on /reset:** D-06 requires soft delete (archive flag), not DELETE SQL.
- **Storing conversation in CONV KV:** This is a Node.js Mac mini app now; SQLite is the persistence layer (Phase 1 migration decision). No KV namespace.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Retry on API failure | Custom retry loop | `@anthropic-ai/sdk` built-in retry | SDK retries on 429/5xx with exponential backoff |
| Message chunking | Custom splitter | Existing `chunkMessage()` in `src/lib/telegram.ts` | Already handles 4000-char splits; reuse directly |
| Token counting pre-call | `countTokens()` API call | Rolling count trim by message count | Avoids extra API round-trip; 200k context = count-based trim is safe |
| HTML escaping | Custom escaper | Instruct Claude to output valid HTML (D-19) | Simpler; Claude follows explicit instructions |
| Date/timezone math | `moment` / `date-fns` | Native `Date` + UTC offset arithmetic | No deps needed; Singapore is UTC+8, fixed offset |

**Key insight:** The Anthropic SDK already handles retry, timeouts, and type safety. The existing `chunkMessage` + `tgSend` pattern handles all response delivery. The main new code is the SQLite schema + conversation state logic.

---

## Common Pitfalls

### Pitfall 1: Conversation ID Not Created Before First Message

**What goes wrong:** `appendMessages()` tries to insert with a `conversation_id` but no active conversation row exists yet.
**Why it happens:** `loadContext()` returns `[]` for a new chat; `conversation_id` is never created.
**How to avoid:** `appendMessages()` must upsert — check for active conversation, create one if missing, then insert messages.
**Warning signs:** FK constraint errors or NULL conversation_id in messages table.

### Pitfall 2: Daily Reset Boundary Race

**What goes wrong:** Two rapid messages straddle the reset timestamp; first message triggers archive, second message tries to load the just-archived conversation.
**Why it happens:** `loadContext()` runs twice near the reset hour boundary.
**How to avoid:** After archiving, create a new conversation row in the same function call. Wrap archive + create in a `db.transaction()`.
**Warning signs:** "No active conversation" on second message immediately after /reset or reset hour.

### Pitfall 3: Anthropic Client Created with Empty API Key

**What goes wrong:** `new Anthropic({ apiKey: "" })` doesn't throw immediately — it throws only on the first API call, with a confusing auth error.
**Why it happens:** `getEnv()` returns `""` for missing env vars.
**How to avoid:** Validate `env.ANTHROPIC_API_KEY` is non-empty in `router.chat()` before creating the client; throw a descriptive error early.
**Warning signs:** "Authentication error" from Anthropic on first message after deploy.

### Pitfall 4: System Prompt Injected as User Message

**What goes wrong:** System prompt appears in conversation history stored in SQLite, inflating context and token counts.
**Why it happens:** System prompt incorrectly added to the `messages[]` array instead of the `system` parameter.
**How to avoid:** Pass system prompt via `system:` parameter in `messages.create()`, never as a `{ role: "system", content: ... }` message. [VERIFIED: Anthropic SDK docs — `system` is a top-level parameter, not a message role]
**Warning signs:** Token counts far higher than expected; Claude references its own instructions as conversation history.

### Pitfall 5: SQLite WAL Mode Not Enabled

**What goes wrong:** Concurrent reads (e.g., `/status` query while `processUpdate` writes) cause lock contention.
**Why it happens:** Default SQLite journal mode uses exclusive locks.
**How to avoid:** `db.pragma("journal_mode = WAL")` immediately after opening the database.
**Warning signs:** `SQLITE_BUSY` errors under any concurrency.

### Pitfall 6: Module-Level DB Singleton in Tests

**What goes wrong:** Tests share a `data/bot.db` file; state leaks between test cases.
**Why it happens:** Singleton pattern opens the real DB file.
**How to avoid:** Accept DB path as a parameter or use `process.env.DB_PATH` with test override to `:memory:`. Add `DB_PATH: ":memory:"` to `vitest.config.ts` env block.
**Warning signs:** Test order-dependency; tests pass individually but fail in sequence.

---

## Code Examples

### Full messages.create() call with system prompt

```typescript
// Source: Context7 /anthropics/anthropic-sdk-typescript — messages API
const response = await client.messages.create({
  model: "claude-haiku-4-5-20251001",
  max_tokens: 4096,
  system: systemPrompt,          // top-level param, NOT a message
  messages: [
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi there." },
    { role: "user", content: "What time is it?" },
  ],
});

const text = response.content
  .filter((b) => b.type === "text")
  .map((b) => (b as { type: "text"; text: string }).text)
  .join("");

const { input_tokens, output_tokens } = response.usage;
```

### /reset handler

```typescript
// Source: [ASSUMED] — project pattern; conversation.ts not yet written
async function handleReset(chatId: number, env: Env): Promise<void> {
  const db = getDb();
  // Soft delete all active conversations for this chat
  db.prepare(
    "UPDATE conversations SET archived = 1 WHERE chat_id = ? AND archived = 0"
  ).run(chatId);
  await tgSend(env, chatId, "Conversation cleared.");
}
```

### /status handler

```typescript
// Source: [ASSUMED] — project pattern
async function handleStatus(chatId: number, env: Env): Promise<void> {
  const db = getDb();
  const today = new Date().toISOString().substring(0, 10); // YYYY-MM-DD

  const todayUsage = db
    .prepare("SELECT input_tokens, output_tokens FROM daily_usage WHERE date = ?")
    .get(today) as { input_tokens: number; output_tokens: number } | undefined;

  const totalUsage = db
    .prepare("SELECT SUM(input_tokens) AS i, SUM(output_tokens) AS o FROM daily_usage")
    .get() as { i: number | null; o: number | null };

  const conv = db
    .prepare(
      `SELECT COUNT(*) AS turns, MAX(m.created_at) AS last_ts
       FROM messages m
       JOIN conversations c ON m.conversation_id = c.id
       WHERE c.chat_id = ? AND c.archived = 0`
    )
    .get(chatId) as { turns: number; last_ts: number | null };

  const model = env.DEFAULT_MODEL || "claude-haiku-4-5-20251001";
  const todayIn = todayUsage?.input_tokens ?? 0;
  const todayOut = todayUsage?.output_tokens ?? 0;
  const totalIn = totalUsage?.i ?? 0;
  const totalOut = totalUsage?.o ?? 0;
  const turns = conv?.turns ?? 0;
  const lastTs = conv?.last_ts
    ? new Date(conv.last_ts * 1000).toISOString().replace("T", " ").substring(0, 16) + " UTC"
    : "—";

  const msg = [
    `<b>Status</b>`,
    `Model: <code>${model}</code>`,
    `Today: ${todayIn + todayOut} tokens (${todayIn} in / ${todayOut} out)`,
    `Total: ${totalIn + totalOut} tokens`,
    `Turns this session: ${turns}`,
    `Last message: ${lastTs}`,
  ].join("\n");

  await tgSend(env, chatId, msg);
}
```

### Token tracking upsert

```typescript
// Source: Context7 /wiselibs/better-sqlite3 — transactions
const upsertUsage = db.prepare(`
  INSERT INTO daily_usage (date, input_tokens, output_tokens)
  VALUES (?, ?, ?)
  ON CONFLICT(date) DO UPDATE SET
    input_tokens = input_tokens + excluded.input_tokens,
    output_tokens = output_tokens + excluded.output_tokens
`);

const today = new Date().toISOString().substring(0, 10);
upsertUsage.run(today, inputTokens, outputTokens);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Workers KV for conversation state | SQLite via `better-sqlite3` | Phase 1 migration decision | Richer queries, no TTL workarounds, survives restarts |
| CF Workers `waitUntil` for async | Node.js `setImmediate` | Phase 1 migration | Same pattern, different primitive |

**Deprecated/outdated:**
- `claude-3-haiku-20240307`: Still available but legacy. D-15 specifies `claude-haiku-4-5-20251001` (200k context, extended thinking capable). [VERIFIED: platform.claude.com/docs/en/about-claude/models/overview]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Anthropic client should be instantiated per-call (not module singleton) since API key flows through `env` | Patterns, Anti-Patterns | If singleton is fine, slight refactor; no correctness risk |
| A2 | System prompt should enumerate allowed HTML tags (`<b>`, `<i>`, `<code>`, `<pre>`, `<a>`) to prevent unsupported tags | Formatting pattern | Claude may produce `<ul>`, `<strong>` etc which Telegram rejects; need fallback stripping |
| A3 | `/reset` response: "Conversation cleared." as confirmation message | Code Examples | User preference — can change wording |
| A4 | `MAX_CONTEXT_MESSAGES = 40` is a sensible rolling window default | D-01 pattern | If users have long technical conversations, 40 messages may cut context too early; can tune |
| A5 | `DB_PATH` should be env-configurable for test override (`:memory:`) | Pitfalls | If not done, integration tests will corrupt real DB |

**Note:** A5 is a planning requirement — the DB path override for tests is not negotiable if tests write to the database.

---

## Open Questions

1. **DB path for tests**
   - What we know: `data/bot.db` is the production path (Phase 1 D-23). Tests currently mock Telegram calls but do not touch SQLite.
   - What's unclear: Should `src/db/index.ts` accept a path override via env var (`DB_PATH`) for `:memory:` in tests?
   - Recommendation: Yes. Add `DB_PATH` to `vitest.config.ts` env block set to `:memory:`.

2. **Token tracking update timing**
   - What we know: Token counts come back in the API response, alongside the assistant message.
   - What's unclear: Should token recording be part of the same transaction as message insert?
   - Recommendation: Yes — wrap `appendMessages` + `upsertUsage` in a single `db.transaction()` to keep counts consistent with stored messages.

3. **Error handling for Claude API failures**
   - What we know: CLAUDE.md rule: generic "Something failed." to user, log error type only.
   - What's unclear: Should /status still work if Claude API is down?
   - Recommendation: `/status` reads only from SQLite — it has no Claude dependency, always works.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | v25.6.1 | — |
| `better-sqlite3` | CONV-01, CONV-02, CONV-03, CONV-04 | ✓ | 12.9.0 | — |
| `@anthropic-ai/sdk` | LLM-02 | ✗ | — | Install: `npm install @anthropic-ai/sdk` |
| `data/` directory | SQLite DB file | ✗ (not yet created) | — | `mkdir -p data` in Wave 0 |

**Missing dependencies with no fallback:**
- `@anthropic-ai/sdk` — must be installed before LLM calls. `npm install @anthropic-ai/sdk`.
- `data/` directory — must be created before DB init. Wave 0 task.

**Missing dependencies with fallback:**
- None.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONV-01 | Multi-turn messages passed to Claude API | unit | `npm test -- test/conversation.test.ts` | ❌ Wave 0 |
| CONV-02 | SQLite persists messages across function calls | unit | `npm test -- test/conversation.test.ts` | ❌ Wave 0 |
| CONV-03 | `/reset` archives active conversation | unit | `npm test -- test/commands.test.ts` | ✅ (extend) |
| CONV-04 | Token counts stored and returned by `/status` | unit | `npm test -- test/conversation.test.ts` | ❌ Wave 0 |
| LLM-01 | Handler calls `router.chat()`, not SDK directly | unit | `npm test -- test/router.test.ts` | ❌ Wave 0 |
| LLM-02 | `router.chat()` calls `anthropic.messages.create()` | unit (mocked) | `npm test -- test/router.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `test/conversation.test.ts` — covers CONV-01, CONV-02, CONV-04; use `:memory:` DB
- [ ] `test/router.test.ts` — covers LLM-01, LLM-02; mock `@anthropic-ai/sdk`
- [ ] `vitest.config.ts` — add `DB_PATH: ":memory:"` to env block
- [ ] `data/` directory — `mkdir -p data && echo "data/bot.db" >> .gitignore` (verify gitignore)
- [ ] Framework install: `npm install @anthropic-ai/sdk`

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Auth already implemented in Phase 1 |
| V3 Session Management | yes | Conversation sessions scoped to `chat_id`; daily reset clears context |
| V4 Access Control | no | Single user; auth gate already enforces |
| V5 Input Validation | yes | User message stored as-is; no SQL injection risk via parameterized queries |
| V6 Cryptography | no | No new crypto; ANTHROPIC_API_KEY in `.env` (gitignored) |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via message content | Tampering | Parameterized queries throughout (never string concatenation in SQL) |
| API key exposure in logs | Info Disclosure | CLAUDE.md hard rule: never log message content or API keys |
| Prompt injection via user message | Tampering | Single-user system; Ben is the only user. No multi-user risk. System prompt position is always `system:` param, never injectable. |
| Conversation history leakage | Info Disclosure | SQLite on Mac mini; no network access to DB. Auth gate blocks non-Ben requests. |
| Token exhaustion / cost attack | Denial of Service | Single user only; rolling window cap (D-01) bounds max tokens per call |

---

## Sources

### Primary (HIGH confidence)

- Context7 `/anthropics/anthropic-sdk-typescript` — Messages API, system prompt param, token counting, extended thinking, model names
- Context7 `/wiselibs/better-sqlite3` — Schema creation, WAL mode, prepared statements, transactions
- [platform.claude.com/docs/en/about-claude/models/overview](https://platform.claude.com/docs/en/about-claude/models/overview) — Model IDs, context windows, extended thinking support matrix

### Secondary (MEDIUM confidence)

- npm registry: `npm view @anthropic-ai/sdk version` → `0.94.0`
- npm registry: `better-sqlite3` version confirmed as `12.9.0` via `node_modules/better-sqlite3/package.json`
- [platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-5](https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-5) — Haiku 4.5 extended thinking confirmation

### Tertiary (LOW confidence)

- None.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — SDK version verified via npm; better-sqlite3 already installed
- Architecture: HIGH — pattern follows directly from existing Phase 1 code structure
- Pitfalls: HIGH — SQLite transaction pitfalls verified via Context7; API pitfalls from official SDK docs

**Research date:** 2026-05-06
**Valid until:** 2026-06-06 (30 days; Anthropic SDK API is stable)
