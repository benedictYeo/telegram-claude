# TASKS.md — Execution Checklist

> Working checklist for Claude Code. Execute top to bottom. Tick boxes as you go. Don't skip phases.
>
> Each task: **Action** (what to do) → **Verify** (how you know it worked).

---

## Phase 0 — Pre-flight (manual, ~30 min)

Done by Ben before Claude Code starts. Don't proceed to Phase 1 until every box is ticked.

### 0.1 Accounts
- [ ] 0.1.1 Cloudflare account exists
- [ ] 0.1.2 Workers Paid plan active ($5/mo) — required for `waitUntil` and cron
- [ ] 0.1.3 Anthropic API account with billing enabled

### 0.2 Telegram bot
- [ ] 0.2.1 Open `@BotFather` in Telegram → `/newbot` → save bot token
- [ ] 0.2.2 `/setprivacy` → Disable (so bot sees all messages in groups, optional)
- [ ] 0.2.3 `/setcommands` → paste:
  ```
  reset - Clear conversation history
  brief - Force morning brief
  digest - Force evening digest
  status - Show bot health
  ```
- [ ] 0.2.4 Message your own bot once → open `https://api.telegram.org/bot<TOKEN>/getUpdates` → copy `from.id` (this is `ALLOWED_USER_ID`)

### 0.3 Local tooling
- [ ] 0.3.1 `node --version` → 20.x or higher
- [ ] 0.3.2 `npm install -g wrangler` → wrangler 4.x
- [ ] 0.3.3 `wrangler login` → browser auth flow

### 0.4 Generate secrets
- [ ] 0.4.1 `openssl rand -hex 32` → save as `TELEGRAM_WEBHOOK_SECRET`
- [ ] 0.4.2 `openssl rand -hex 32` → save as `WEBHOOK_SECRET`
- [ ] 0.4.3 Stash all secrets in 1Password / Bitwarden, not in plaintext file

### 0.5 Repo init
- [ ] 0.5.1 `mkdir telegram-claude-orchestrator && cd $_`
- [ ] 0.5.2 `git init`
- [ ] 0.5.3 Drop `PLAN.md`, `TASKS.md`, `CLAUDE.md` at root
- [ ] 0.5.4 Create GitHub repo (private), push initial commit
- [ ] 0.5.5 Open in Claude Code

---

## Phase 1 — Skeleton + auth (2–3h)

**Goal:** Echo bot that only responds to me, deployed and verified.

### 1.1 Project scaffold
- [x] 1.1.1 `npm init -y`
- [x] 1.1.2 `npm install -D wrangler typescript @cloudflare/workers-types vitest @cloudflare/vitest-pool-workers`
- [x] 1.1.3 Create `tsconfig.json` (target ES2022, strict, lib: ESNext)
- [x] 1.1.4 Create `wrangler.toml`:
  ```toml
  name = "tg-claude"
  main = "src/index.ts"
  compatibility_date = "2025-01-01"
  workers_dev = true

  [observability]
  enabled = true
  ```
- [x] 1.1.5 Create `.gitignore` (node_modules, .env*, .wrangler, dist, .dev.vars)
- [x] 1.1.6 Create `src/types.ts` with `Env` interface (all bindings + secrets typed)

### 1.2 Auth core
- [x] 1.2.1 Create `src/core/auth.ts` with `checkWebhookSignature(req, env)` returning `Response | null`
- [x] 1.2.2 Add `checkUserAllowed(update, env)` returning `boolean`
- [x] 1.2.3 Write unit tests in `test/auth.test.ts` (valid sig, invalid sig, missing sig, valid user, wrong user, missing user)
- [x] 1.2.4 `npx vitest run` → all green

### 1.3 Telegram core
- [x] 1.3.1 Create `src/core/telegram.ts` with `tgSend(env, chatId, text, parseMode?)`
- [x] 1.3.2 Add `tgSendChatAction(env, chatId, action)` (typing indicator)
- [x] 1.3.3 Add `chunkMessage(text, max=4000)` returning `string[]`
- [x] 1.3.4 Unit test chunking edge cases (empty, single char, exactly 4000, 12000+)

### 1.4 Webhook handler
- [x] 1.4.1 Create `src/handlers/telegram.ts` with `handleTelegramWebhook(req, env, ctx)`
- [x] 1.4.2 Parse update, run auth checks, echo back text via `tgSend`
- [x] 1.4.3 Silent drop on user mismatch (return 200, no message, no log)
- [x] 1.4.4 401 on signature mismatch

### 1.5 Worker entry
- [x] 1.5.1 Create `src/index.ts` exporting `default { fetch, scheduled }`
- [x] 1.5.2 Route `POST /webhook` → `handleTelegramWebhook`
- [x] 1.5.3 Route `GET /health` → `200 "ok"` (no auth, no info disclosure)
- [x] 1.5.4 Catch-all → 404
- [x] 1.5.5 `scheduled` stub for now

### 1.6 Local dev
- [ ] 1.6.1 Create `.dev.vars` (gitignored) with all secrets for local testing
- [ ] 1.6.2 `wrangler dev` → no errors
- [ ] 1.6.3 `curl localhost:8787/health` → `ok`

### 1.7 Deploy + register
- [ ] 1.7.1 `wrangler secret put TELEGRAM_BOT_TOKEN`
- [ ] 1.7.2 `wrangler secret put TELEGRAM_WEBHOOK_SECRET`
- [ ] 1.7.3 `wrangler secret put ALLOWED_USER_ID`
- [ ] 1.7.4 `wrangler deploy` → note worker URL (e.g. `tg-claude.<sub>.workers.dev`)
- [ ] 1.7.5 Register webhook:
  ```bash
  curl -X POST "https://api.telegram.org/bot${TOKEN}/setWebhook" \
    -d "url=https://tg-claude.<sub>.workers.dev/webhook" \
    -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
    -d "drop_pending_updates=true"
  ```
- [ ] 1.7.6 Verify: `curl "https://api.telegram.org/bot${TOKEN}/getWebhookInfo"` → URL set, no errors

### 1.8 Acceptance
- [ ] 1.8.1 Send "hi" from your Telegram → receive "hi" back
- [ ] 1.8.2 Send "hello" from a second Telegram account → no response, no log entry
- [ ] 1.8.3 `curl -X POST https://tg-claude.<sub>.workers.dev/webhook -d '{}'` → 401
- [ ] 1.8.4 `wrangler tail` shows no message bodies in logs
- [ ] 1.8.5 Commit: `feat(phase-1): echo bot with auth gate`

---

## Phase 2 — Claude + ack-defer (1–2h)

**Goal:** Bot replies with Claude, never times out.

### 2.1 Anthropic client
- [ ] 2.1.1 `npm install @anthropic-ai/sdk`
- [ ] 2.1.2 Create `src/core/claude.ts` with `callClaude(env, messages)` returning text
- [ ] 2.1.3 Use `claude-sonnet-4-6` (or latest), `max_tokens: 4096`
- [ ] 2.1.4 Add system prompt: "You are Ben's personal assistant via Telegram. Be concise. 3-6 word sentences. No filler. Direct answers only."

### 2.2 Ack-defer pattern
- [ ] 2.2.1 In `handleTelegramWebhook`: respond `200 ok` immediately
- [ ] 2.2.2 Wrap Claude call in `ctx.waitUntil(processMessage(...))`
- [ ] 2.2.3 In `processMessage`: send `typing` action, call Claude, send chunked reply
- [ ] 2.2.4 Catch errors → send `⚠️ <generic error>` to user, log error type only (no body)

### 2.3 Commands routing
- [ ] 2.3.1 If text starts with `/`, route to command handler
- [ ] 2.3.2 `/status` → reply with worker version + uptime stub
- [ ] 2.3.3 Other commands stubbed for later phases

### 2.4 Secrets + deploy
- [ ] 2.4.1 `wrangler secret put ANTHROPIC_API_KEY`
- [ ] 2.4.2 `wrangler deploy`

### 2.5 Acceptance
- [ ] 2.5.1 Send "what's 2+2" → reply within ~5s
- [ ] 2.5.2 Send "write me a 1000-word story" → receive multiple chunked messages
- [ ] 2.5.3 Send `/status` → reply with version
- [ ] 2.5.4 Check `wrangler tail` → no duplicate `update_id` (no Telegram retries)
- [ ] 2.5.5 Commit: `feat(phase-2): claude integration with ack-defer`

---

## Phase 3 — Conversation state (1–2h)

**Goal:** Multi-turn memory with TTL.

### 3.1 KV setup
- [ ] 3.1.1 `wrangler kv namespace create CONV` → copy ID
- [ ] 3.1.2 `wrangler kv namespace create CONV --preview` → copy preview ID
- [ ] 3.1.3 Add `[[kv_namespaces]]` block to `wrangler.toml`

### 3.2 State module
- [ ] 3.2.1 Create `src/state/conversation.ts`
- [ ] 3.2.2 `getHistory(env, chatId)` → returns `Message[]` from KV (empty if none)
- [ ] 3.2.3 `appendTurn(env, chatId, role, content)` → push, trim to last 20, write with `expirationTtl: 86400`
- [ ] 3.2.4 `clearHistory(env, chatId)` → delete key

### 3.3 Wire into handler
- [ ] 3.3.1 Before Claude call: load history, append user turn
- [ ] 3.3.2 After Claude reply: append assistant turn
- [ ] 3.3.3 `/reset` command → clear, confirm with "🗑 history cleared"

### 3.4 Acceptance
- [ ] 3.4.1 Send "my favorite color is blue" → "what is my favorite color?" → "blue"
- [ ] 3.4.2 `/reset` → "what is my favorite color?" → "I don't know"
- [ ] 3.4.3 KV inspect: `wrangler kv key get --binding=CONV chat:<id>` → shows JSON array
- [ ] 3.4.4 Commit: `feat(phase-3): conversation state with 24h ttl`

---

## Phase 4 — MCP servers (2–3h)

**Goal:** Claude can use Notion, Telegram, Supabase MCPs.

### 4.1 MCP config builder
- [ ] 4.1.1 Create `src/core/mcp.ts` with `buildMcpServers(env)` returning array
- [ ] 4.1.2 Confirm current Anthropic API beta header for `mcp_servers` (check docs at build time)
- [ ] 4.1.3 Add to `callClaude` invocation

### 4.2 Notion MCP first (simplest auth)
- [ ] 4.2.1 Create Notion internal integration → copy token
- [ ] 4.2.2 Share target Notion pages with the integration
- [ ] 4.2.3 `wrangler secret put NOTION_TOKEN`
- [ ] 4.2.4 Add Notion entry to `buildMcpServers`
- [ ] 4.2.5 Test: "list my Notion pages titled 'Inbox'"

### 4.3 Telegram MCP
- [ ] 4.3.1 Reuse existing Telegram MCP URL (already deployed)
- [ ] 4.3.2 Add to `buildMcpServers` with bot token auth
- [ ] 4.3.3 Test: "send myself a Telegram message: hello from claude"

### 4.4 Supabase MCP
- [ ] 4.4.1 `wrangler secret put SUPABASE_URL`
- [ ] 4.4.2 `wrangler secret put SUPABASE_ACCESS_TOKEN`
- [ ] 4.4.3 Add to `buildMcpServers`
- [ ] 4.4.4 Test: "list my Supabase projects"

### 4.5 Multi-block response handling
- [ ] 4.5.1 Update `callClaude` to extract only `type: "text"` blocks for user reply
- [ ] 4.5.2 Log MCP tool names invoked (not args, not results)
- [ ] 4.5.3 Surface MCP errors as `⚠️ tool '<name>' failed` (not raw error)

### 4.6 Acceptance
- [ ] 4.6.1 "What's in my Notion 'Inbox' today?" → returns actual entries
- [ ] 4.6.2 "Send myself a Telegram saying ping" → receive "ping"
- [ ] 4.6.3 Forced bad call (e.g. nonexistent Notion DB) → graceful error
- [ ] 4.6.4 Commit: `feat(phase-4): mcp integration (notion, telegram, supabase)`

---

## Phase 5 — Cron briefs (1–2h)

**Goal:** Wake up to a brief. Get evening digest.

### 5.1 Cron config
- [ ] 5.1.1 Add to `wrangler.toml`:
  ```toml
  [triggers]
  crons = ["0 22 * * *", "0 12 * * *"]   # 06:00 SGT, 20:00 SGT
  ```

### 5.2 Cron router
- [ ] 5.2.1 Create `src/handlers/cron.ts` with `handleCron(event, env)`
- [ ] 5.2.2 Switch on `event.cron` string → call task function
- [ ] 5.2.3 Wire from `index.ts` `scheduled()` via `ctx.waitUntil`

### 5.3 Morning brief task
- [ ] 5.3.1 Create `src/tasks/morning-brief.ts`
- [ ] 5.3.2 Prompt Claude with system: "Generate Ben's morning brief. Use Notion 'Today' page + any other context."
- [ ] 5.3.3 Push result to `ALLOWED_USER_ID` chat (chat_id = user_id for DMs)

### 5.4 Evening digest task
- [ ] 5.4.1 Create `src/tasks/digest.ts`
- [ ] 5.4.2 Prompt: "Summarize Ben's day. What got done. What's pending."
- [ ] 5.4.3 Push to chat

### 5.5 Manual triggers
- [ ] 5.5.1 `/brief` command → calls morning brief on demand
- [ ] 5.5.2 `/digest` command → calls digest on demand

### 5.6 Acceptance
- [ ] 5.6.1 `/brief` → receive sensible brief
- [ ] 5.6.2 `/digest` → receive sensible digest
- [ ] 5.6.3 Wait for next scheduled cron → arrives on time
- [ ] 5.6.4 `wrangler tail` shows cron firing
- [ ] 5.6.5 Commit: `feat(phase-5): scheduled briefs and digests`

---

## Phase 6 — Webhook ingress (1–2h)

**Goal:** External services push to Telegram via Worker.

### 6.1 Hook router
- [ ] 6.1.1 Add route `POST/GET /hook/:source` in `index.ts`
- [ ] 6.1.2 Verify `?key=` matches `WEBHOOK_SECRET` → 401 otherwise
- [ ] 6.1.3 Dispatch to handler by `:source` param

### 6.2 Generic handler
- [ ] 6.2.1 `src/handlers/webhook.ts` with `handleGeneric(payload)` → JSON pretty-print
- [ ] 6.2.2 Send to `ALLOWED_USER_ID` chat with HTML `<pre>` block

### 6.3 GitHub handler (example)
- [ ] 6.3.1 `handleGithub(payload, headers)` → format issue/PR/push events
- [ ] 6.3.2 Verify `X-Hub-Signature-256` if you set a GitHub webhook secret
- [ ] 6.3.3 Skip noisy events (e.g. PR sync without changes)

### 6.4 Optional: Claude summarization
- [ ] 6.4.1 If payload >2000 chars, route through Claude to summarize before sending
- [ ] 6.4.2 Add `?summarize=1` query param to opt in

### 6.5 Secrets + deploy
- [ ] 6.5.1 `wrangler secret put WEBHOOK_SECRET`
- [ ] 6.5.2 `wrangler deploy`

### 6.6 Acceptance
- [ ] 6.6.1 `curl -X POST "https://tg-claude.<sub>.workers.dev/hook/test?key=$WEBHOOK_SECRET" -H 'content-type: application/json' -d '{"hello":"world"}'` → receive in Telegram
- [ ] 6.6.2 Same without `?key=` → 401
- [ ] 6.6.3 Wire a GitHub repo webhook → trigger event → receive formatted message
- [ ] 6.6.4 Commit: `feat(phase-6): webhook ingress for external alerts`

---

## Phase 7 — Google OAuth + Gmail/Cal/Drive (3–4h)

**Goal:** Full Google MCP suite working over Telegram.

### 7.1 GCP setup
- [ ] 7.1.1 Create GCP project (or reuse)
- [ ] 7.1.2 Enable Gmail API, Calendar API, Drive API
- [ ] 7.1.3 Configure OAuth consent screen (External, only your email as test user)
- [ ] 7.1.4 Create OAuth 2.0 client (Web application)
- [ ] 7.1.5 Add redirect URI: `https://tg-claude.<sub>.workers.dev/oauth/google/callback`
- [ ] 7.1.6 Copy client ID + secret

### 7.2 OAuth KV
- [ ] 7.2.1 `wrangler kv namespace create OAUTH`
- [ ] 7.2.2 Add binding to `wrangler.toml`

### 7.3 OAuth flow routes
- [ ] 7.3.1 `GET /oauth/google/start` → redirect to Google consent URL with proper scopes
- [ ] 7.3.2 `GET /oauth/google/callback` → exchange code for tokens, store refresh token in KV under `google:<user_id>`
- [ ] 7.3.3 Both routes require auth via short-lived signed URL (or simple `?key=` for v1)

### 7.4 Token refresh wrapper
- [ ] 7.4.1 Create `src/state/oauth.ts` with `getGoogleAccessToken(env, userId)`
- [ ] 7.4.2 If access token cached and not expired → return
- [ ] 7.4.3 Else: refresh using refresh token → cache new access token (KV with TTL = expires_in - 60s)
- [ ] 7.4.4 Wrap MCP calls so 401 triggers refresh + retry once

### 7.5 Wire Google MCPs
- [ ] 7.5.1 Add Gmail, Calendar, Drive entries to `buildMcpServers` with bearer token
- [ ] 7.5.2 Token resolved per-request from `getGoogleAccessToken`

### 7.6 Secrets + deploy
- [ ] 7.6.1 `wrangler secret put GOOGLE_CLIENT_ID`
- [ ] 7.6.2 `wrangler secret put GOOGLE_CLIENT_SECRET`
- [ ] 7.6.3 `wrangler deploy`

### 7.7 First-time consent
- [ ] 7.7.1 On phone, visit `/oauth/google/start?key=...`
- [ ] 7.7.2 Complete Google consent
- [ ] 7.7.3 Land on success page

### 7.8 Acceptance
- [ ] 7.8.1 "What's on my calendar today?" → real events
- [ ] 7.8.2 "Any new emails from <person>?" → real results
- [ ] 7.8.3 "Find file 'PLAN.md' in my Drive" → real result
- [ ] 7.8.4 Wait 1h+ → query again → still works (refresh succeeded)
- [ ] 7.8.5 Commit: `feat(phase-7): google oauth + gmail/cal/drive mcp`

---

## Phase 8 — Hardening (1–2h)

**Goal:** Production-ready posture before daily use.

### 8.1 Observability
- [ ] 8.1.1 Confirm `[observability]` block in `wrangler.toml`
- [ ] 8.1.2 Add structured logs for: cron fires, MCP tool invocations, errors (no payloads)
- [ ] 8.1.3 Set up Cloudflare alert: error rate > 5% → email

### 8.2 Cost guardrails
- [ ] 8.2.1 Anthropic console: set monthly budget alert ($20 to start)
- [ ] 8.2.2 Add daily token counter in KV → `/status` shows today's usage
- [ ] 8.2.3 Hard cap: if today's spend > $X, send warning + reject new requests

### 8.3 Idempotency
- [ ] 8.3.1 Cache `update_id` in KV (5min TTL) → drop duplicates
- [ ] 8.3.2 Test: trigger Telegram retry by holding a request → second delivery dropped

### 8.4 Pause switch
- [ ] 8.4.1 Add `PAUSED` env var check at top of every handler
- [ ] 8.4.2 If paused, return 200 + log only
- [ ] 8.4.3 Document toggle in README

### 8.5 Backup + restore
- [ ] 8.5.1 Document KV export procedure
- [ ] 8.5.2 Document `setWebhook` re-registration
- [ ] 8.5.3 Document secret rotation steps

### 8.6 Acceptance
- [ ] 8.6.1 `/status` shows usage, version, uptime, cost-today
- [ ] 8.6.2 Set `PAUSED=1` → bot silent → unset → bot responds again
- [ ] 8.6.3 Commit: `feat(phase-8): hardening (idempotency, costs, pause)`

---

## Definition of Done

Project is "done v1" when all of the below are true:

- [ ] All 8 phases shipped to production
- [ ] All acceptance criteria met
- [ ] `README.md` covers: what it is, setup, deploy, ops
- [ ] No secrets in repo (audit with `git log -p | grep -i token`)
- [ ] No payload logging (grep `console.log` for any object spreads)
- [ ] Used daily for 1 week with zero manual interventions

---

## Backlog (v2+)

Captured here so they don't pollute v1 scope.

- File / image input from Telegram → Claude vision
- Voice notes → Whisper → Claude
- Approval gates for destructive MCP actions (send email, delete file)
- Multi-conversation threads per chat (`/new`, `/switch <id>`)
- Cloudflare Queues + Durable Objects for >5min tasks
- Persistent long-term memory (separate KV layer)
- Inline Telegram keyboards for quick actions
- Per-source webhook secrets
- Web dashboard (read-only) for KV inspection + cost view
- Trigger Claude Code on remote machine (next-level orchestration)

---

## File map at completion

```
.
├── PLAN.md                     # Strategy + architecture
├── TASKS.md                    # This file
├── CLAUDE.md                   # Claude Code instructions
├── README.md                   # Setup + ops
├── wrangler.toml
├── package.json
├── tsconfig.json
├── .gitignore
├── src/
│   ├── index.ts
│   ├── types.ts
│   ├── core/
│   │   ├── auth.ts
│   │   ├── claude.ts
│   │   ├── mcp.ts
│   │   └── telegram.ts
│   ├── handlers/
│   │   ├── telegram.ts
│   │   ├── cron.ts
│   │   └── webhook.ts
│   ├── state/
│   │   ├── conversation.ts
│   │   └── oauth.ts
│   └── tasks/
│       ├── morning-brief.ts
│       └── digest.ts
└── test/
    ├── auth.test.ts
    ├── chunking.test.ts
    └── handler.test.ts
```
