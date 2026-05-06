# Phase 2: Conversation Core - Context

**Gathered:** 2026-05-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Multi-turn conversation with Claude via Telegram. SQLite persistence for conversation state and token tracking. Rolling context window with daily auto-reset. New commands: /reset (manual clear), /status (usage display). Model router abstraction with Anthropic SDK as first provider. This phase replaces the "Received. AI coming soon." placeholder with real Claude responses.

</domain>

<decisions>
## Implementation Decisions

### Conversation Memory
- **D-01:** Memory strategy (rolling window vs token-counted trim) — Claude's discretion. Pick the approach that best fits the model's context window while keeping implementation simple.
- **D-02:** Daily reset at 5am SGT. Configurable via `RESET_HOUR_UTC` env var (default: `21` = 5am SGT). Not a TTL — conversation clears on a schedule, not after inactivity.
- **D-03:** Full message storage in SQLite — store role, content, timestamp, token count per message. Enables /status token tracking and future search/export.
- **D-04:** Silent fresh start after daily reset. No announcement that context was cleared. Just respond normally.
- **D-05:** `/reset` is the only manual clear command. No `/new` or thread variants. Simple.
- **D-06:** Soft delete (archive) old conversations at daily reset. Messages stay in DB marked as archived. Not loaded into context but preserved for potential future use (search, export).
- **D-07:** No continuation indicator on chunked messages. Just send chunks sequentially. Telegram shows them as separate messages.

### System Prompt
- **D-08:** Concise + direct personality. Matches CLAUDE.md style: short sentences, direct answers, no filler. Like a sharp technical co-pilot.
- **D-09:** Progressive system prompt. Start minimal in Phase 2. Each phase appends its capabilities as they're built. System prompt grows with the project.
- **D-10:** Telegram-aware prompt. System prompt tells Claude it's accessed via Telegram, to keep responses concise for chat interface, and to use HTML formatting.
- **D-11:** Inject current date/time (SGT) into system prompt on each call. Enables time-aware responses.

### Status Command
- **D-12:** Minimal display: today's token count (input + output) and current model name.
- **D-13:** Token counts persist across daily resets. Stored per-day in SQLite. /status shows today AND cumulative running total.
- **D-14:** Include conversation state info: current conversation turn count and last message time.

### Model Selection
- **D-15:** Default model: `claude-haiku-4-5-20251001`. Fast and cheap for everyday assistant tasks.
- **D-16:** Model configurable via `DEFAULT_MODEL` env var. Easy to switch without code changes.
- **D-17:** Wire extended thinking infrastructure now, disabled by default. Haiku 4.5 doesn't support it. Ready for Phase 3 when Sonnet/Opus are added.
- **D-18:** Non-streaming API calls. Single API call, get full response. Pair with typing indicator while waiting.

### Claude's Discretion
- **D-01:** Memory trim strategy — Claude picks rolling window vs token-counted based on model context and simplicity.
- **D-19:** Formatting approach — Claude decides whether to instruct Claude API to output HTML directly or convert markdown to HTML in code. Pick what produces the best Telegram rendering.
- **D-20:** Model router abstraction level — Claude picks the minimum viable abstraction that doesn't block Phase 3 (OpenAI/Ollama support).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — Core value, constraints, key decisions
- `.planning/REQUIREMENTS.md` — CONV-01 through CONV-04, LLM-01, LLM-02 requirements for this phase
- `.planning/ROADMAP.md` — Phase 2 goal, success criteria, dependencies

### Phase 1 Context (carry forward)
- `.planning/phases/01-infrastructure-foundation/01-CONTEXT.md` — D-17 (better-sqlite3), D-18 (pino), D-23 (data/bot.db path), D-05 (Vitest + supertest)

### Existing Codebase
- `src/index.ts` — Hono app entry point (add new routes here)
- `src/routes/telegram.ts` — Webhook handler with ack-and-defer via setImmediate (extend processUpdate)
- `src/lib/commands.ts` — Command router Map registry (add /reset, /status here)
- `src/lib/telegram.ts` — tgSend, tgSendChatAction, chunkMessage (reuse for Claude responses)
- `src/env.ts` — getEnv() bridge from process.env to typed Env interface (add new env vars)
- `src/types.ts` — Env interface (add ANTHROPIC_API_KEY, DEFAULT_MODEL, RESET_HOUR_UTC)

### External Documentation
- Anthropic SDK docs — `@anthropic-ai/sdk` package for Messages API integration

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/telegram.ts`: tgSend + tgSendChatAction + chunkMessage — reuse directly for sending Claude responses. Chunking at 4000 chars already handles long responses.
- `src/lib/commands.ts`: Map<string, CommandHandler> registry — add /reset and /status handlers to the existing Map.
- `src/lib/auth.ts`: checkWebhookSignature + checkUserAllowed — already wired in webhook handler, no changes needed.
- `src/lib/logger.ts`: pino logger — use for logging Claude API call outcomes (type only, never content).
- `better-sqlite3`: Installed in Phase 1, ready for schema creation.

### Established Patterns
- Ack-and-defer: setImmediate in src/routes/telegram.ts. Claude API calls go inside processUpdate, which already runs async after 200 ack.
- Command routing: routeCommand checks for slash commands before AI dispatch. /reset and /status added to the Map.
- Error handling: Generic "Something failed." to user, logger.error({ type }) only. Apply same pattern to Claude API errors.
- HTML parse mode default in tgSend. System prompt should align with this.

### Integration Points
- `src/routes/telegram.ts:processUpdate()` — Currently sends placeholder "Received. AI coming soon." Replace with Claude API call.
- `src/lib/commands.ts` Map — Add entries for "reset" and "status" handlers.
- `src/env.ts:getEnv()` — Add ANTHROPIC_API_KEY, DEFAULT_MODEL, RESET_HOUR_UTC to the bridge.
- `src/types.ts:Env` — Extend with new env vars.
- `.env.example` — Add DEFAULT_MODEL, RESET_HOUR_UTC.

</code_context>

<specifics>
## Specific Ideas

- System prompt should be Telegram-aware and inject current date/time SGT on every call.
- In a future phase (Phase 4), the system prompt will be stored in/loaded from Obsidian vault instead of hardcoded. Design the prompt loading so this swap is straightforward.

</specifics>

<deferred>
## Deferred Ideas

- **System prompt from Obsidian vault** — Instead of hardcoded, load system prompt from a file in the Obsidian vault. Enables editing the prompt from any Obsidian-synced device. Requires Phase 4 (Obsidian Integration).
- **Reminder functionality** — "Remind me to do X at Y time" creates a scheduled message. Requires Phase 7 (Cron Scheduler).
- **Extended thinking for complex queries** — Enable when thinking-capable models are available. Deferred to Phase 3 (Model Router) when Sonnet/Opus are added.

</deferred>

---

*Phase: 2-Conversation Core*
*Context gathered: 2026-05-06*
