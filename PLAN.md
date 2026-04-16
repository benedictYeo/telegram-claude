# Telegram Claude Orchestrator — Project Plan

> Personal AI orchestration layer. Telegram is the interface. Cloudflare Worker is the brain. Always-on, no laptop required.

## 1. Goals

- Chat with Claude from Telegram, anywhere, mobile-first.
- Use my MCP servers (Notion, Gmail, Calendar, Drive, Telegram, Supabase).
- Receive scheduled briefs (morning agenda, daily digest).
- Receive push alerts from external webhooks (GitHub, monitoring, custom hooks).
- Lock down so only I can use it.
- Zero servers to maintain. Zero laptop dependency.

## 2. Non-goals (v1)

- Multi-user / family access.
- Code execution / Claude Code remote trigger.
- Voice input / output.
- File generation back to Telegram (text only v1).
- Persistent long-term memory (use claude.ai for that).

## 3. Architecture

```
┌────────────────────────────────────────────────────────────┐
│                  Cloudflare Worker (single)                │
│                                                            │
│   Telegram POST  ─→ /webhook        ┐                      │
│   Cron schedule  ─→ scheduled()     ├─→ handler core       │
│   External hook  ─→ /hook/:source   ┘     │                │
│                                            ▼               │
│                                   Anthropic Messages API   │
│                                   + mcp_servers[]          │
│                                            │               │
│                                            ▼               │
│                                   Telegram sendMessage     │
│                                                            │
│   State: KV (24h TTL)   Secrets: env vars   Logs: tail     │
└────────────────────────────────────────────────────────────┘
```

**Three triggers, one handler.** Webhook for inbound chat, cron for scheduled briefs, hook endpoint for external alerts. All converge on the same handler that calls the Anthropic API and pushes results back via Telegram.

## 4. Tech stack

| Layer | Choice | Rationale |
|---|---|---|
| Runtime | Cloudflare Workers (Paid, $5/mo) | Always-on, free tier blocks `waitUntil` |
| Language | TypeScript | Worker-native, good Anthropic SDK |
| Bundler | Wrangler 4.x | Official Cloudflare tooling |
| State | Workers KV | Conversation state, OAuth refresh tokens |
| Secrets | Wrangler secrets | Encrypted at rest |
| LLM | Anthropic Messages API + MCP connectors | Native MCP support |
| Bot | Telegram Bot API (HTTPS, no library) | Smallest dependency surface |
| Tests | Vitest + Miniflare | Worker-aware test runner |

## 5. Repo structure

```
.
├── src/
│   ├── index.ts                # Worker entry: fetch + scheduled
│   ├── handlers/
│   │   ├── telegram.ts         # /webhook handler
│   │   ├── cron.ts             # scheduled() handler
│   │   └── webhook.ts          # /hook/:source handler
│   ├── core/
│   │   ├── claude.ts           # Anthropic API wrapper
│   │   ├── mcp.ts              # MCP server config builder
│   │   ├── telegram.ts         # sendMessage, chunking, parse mode
│   │   └── auth.ts             # Telegram secret + user ID checks
│   ├── state/
│   │   ├── conversation.ts     # KV conv read/write, TTL
│   │   └── oauth.ts            # OAuth token refresh
│   ├── tasks/
│   │   ├── morning-brief.ts    # Cron task: daily agenda
│   │   └── digest.ts           # Cron task: end-of-day summary
│   └── types.ts
├── test/
│   ├── auth.test.ts
│   ├── telegram.test.ts
│   └── handler.test.ts
├── wrangler.toml
├── package.json
├── tsconfig.json
├── .gitignore
├── README.md
├── CLAUDE.md                   # Personal context for Claude Code
└── PLAN.md                     # This file
```

## 6. Security model

### Threat model
- Adversary discovers Worker URL, attempts to invoke bot.
- Adversary spoofs Telegram webhooks.
- Adversary triggers external `/hook/*` endpoint.
- Worker logs leak conversation content.
- KV holds sensitive content past need.
- Secrets leak via repo, source maps, or error pages.

### Controls

1. **Telegram webhook secret** — `setWebhook` with `secret_token`. Verify `X-Telegram-Bot-Api-Secret-Token` header on every POST. Reject mismatches with 401.
2. **User ID allowlist** — check `update.message.from.id` against `ALLOWED_USER_ID` secret. Silent drop on mismatch (no error, no echo).
3. **Webhook ingress secret** — `/hook/:source` requires `?key=` matching `WEBHOOK_SECRET`. Per-source sub-keys later.
4. **Secrets via Wrangler only** — `wrangler secret put`. Never in `wrangler.toml`, `.env`, or code. `.env*` in `.gitignore`.
5. **KV TTL** — every conversation entry written with `expirationTtl: 86400` (24h). OAuth refresh tokens stored separately, no TTL but encrypted-at-rest by KV.
6. **No body logging** — log event types and outcomes only. Never log message content, never log MCP responses.
7. **Error responses** — never echo input, never reveal stack traces. Generic 200 for everything Telegram-facing (Telegram retries on non-200).
8. **Optional: Cloudflare WAF rule** — restrict `/webhook` source IP to Telegram ranges (`149.154.160.0/20`, `91.108.4.0/22`).

## 7. Secrets inventory

| Name | Source | Purpose |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | @BotFather | Bot identity |
| `TELEGRAM_WEBHOOK_SECRET` | random 32-byte hex | Webhook auth |
| `ALLOWED_USER_ID` | `/start` your bot, log the ID | User allowlist |
| `ANTHROPIC_API_KEY` | console.anthropic.com | LLM calls |
| `WEBHOOK_SECRET` | random 32-byte hex | External hook auth |
| `NOTION_TOKEN` | Notion integration | Notion MCP auth |
| `GOOGLE_CLIENT_ID` | GCP console | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | GCP console | Google OAuth |
| `SUPABASE_URL` | Supabase project | Supabase MCP |
| `SUPABASE_SERVICE_KEY` | Supabase project | Supabase MCP |

KV namespaces:
- `CONV` — conversation state (24h TTL).
- `OAUTH` — Google refresh tokens (no TTL).

## 8. Phases

Each phase = ship a working slice. Don't progress until prior phase is deployed and verified.

### Phase 1 — Skeleton + auth (2–3h)

**Tasks**
- `wrangler init`, set up TypeScript, Vitest.
- Implement `/webhook` POST handler.
- Verify Telegram webhook secret header.
- Verify `from.id` against `ALLOWED_USER_ID`.
- Echo bot: reply with received text.
- Deploy to Workers. Set webhook via `setWebhook`.

**Acceptance**
- Send "hi" from my Telegram → receive "hi" back.
- Send from a second account → no response, no error in logs.
- POST to `/webhook` with wrong secret → 401.

### Phase 2 — Claude + ack-defer (1–2h)

**Tasks**
- Add `core/claude.ts` calling Anthropic Messages API.
- Replace echo with Claude response.
- Implement ack-and-defer: 200 immediately, `ctx.waitUntil` for Claude call, `sendMessage` when done.
- Send `sendChatAction: typing` before the long call.
- Chunk responses >4000 chars.

**Acceptance**
- Ask Claude a question, get a response within ~10s.
- Ask a question requiring a long answer, get chunked messages.
- Telegram never times out (no duplicate webhook deliveries in logs).

### Phase 3 — Conversation state (1–2h)

**Tasks**
- KV namespace `CONV`. Key: `chat:{chat_id}`. Value: array of `{role, content}`.
- Read prior turns on inbound, append, write back with 24h TTL.
- Trim to last N turns (start: N=20) to control token cost.
- `/reset` command clears the KV key.

**Acceptance**
- Multi-turn conversation works ("what did I just ask?" → correct reply).
- After 24h, history naturally expires.
- `/reset` immediately clears.

### Phase 4 — MCP servers (2–3h)

**Tasks**
- `core/mcp.ts` builds `mcp_servers[]` array from env config.
- Start with Notion (simplest auth: bearer token).
- Add Telegram MCP (reuse bot token).
- Add Supabase (API key).
- Wire `mcp_servers` into Anthropic call. Confirm beta header requirement at build time.
- Handle multi-block responses (text + mcp_tool_use + mcp_tool_result).

**Acceptance**
- "What's in my Notion 'Inbox' today?" returns actual entries.
- "Send a Telegram message to myself: test" works.
- MCP errors surface gracefully (not silent, not crash).

### Phase 5 — Cron briefs (1–2h)

**Tasks**
- `wrangler.toml` cron triggers: morning (e.g. `0 22 * * *` UTC = 6am SGT), evening (`0 12 * * *` UTC = 8pm SGT).
- `scheduled()` handler dispatches by cron expression.
- `tasks/morning-brief.ts`: prompt Claude with calendar + Notion today + weather → push to my chat.
- `tasks/digest.ts`: end-of-day summary prompt.
- Send via `sendMessage` to my chat ID.

**Acceptance**
- Wake up to morning brief.
- Receive evening digest.
- Cron failures logged, retried via Cloudflare's built-in retry.

### Phase 6 — Webhook ingress (1–2h)

**Tasks**
- `/hook/:source` GET+POST. Require `?key=WEBHOOK_SECRET`.
- Per-source handlers: format payload → push to Telegram.
- Initial sources: GitHub (issue/PR notifications), generic (raw JSON pretty-printed).
- Optional: route through Claude for summarization before sending.

**Acceptance**
- Push a GitHub webhook → receive formatted Telegram message.
- POST to `/hook/test?key=...` with JSON → receive pretty version.
- Wrong key → 401, no echo.

### Phase 7 — Google OAuth + Gmail/Cal/Drive (3–4h)

**Tasks**
- Worker route `/oauth/google/start` → Google consent URL.
- Worker route `/oauth/google/callback` → exchange code, store refresh token in `OAUTH` KV under `google:{user_id}`.
- `state/oauth.ts`: get access token, refresh on 401.
- Add Google MCP servers to `mcp.ts` once tokens flow.

**Acceptance**
- Visit `/oauth/google/start` once on phone, complete consent.
- "What's on my calendar today?" works through Telegram.
- Token auto-refreshes after 1h expiry.

## 9. Key code patterns

### Auth gate (Phase 1)
```ts
function checkAuth(req: Request, env: Env): Response | null {
  const sig = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (sig !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response('unauthorized', { status: 401 });
  }
  return null;
}

function checkUser(update: TgUpdate, env: Env): boolean {
  const fromId = update.message?.from?.id ?? update.callback_query?.from?.id;
  return String(fromId) === env.ALLOWED_USER_ID;
}
```

### Ack-and-defer (Phase 2)
```ts
export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const authFail = checkAuth(req, env);
    if (authFail) return authFail;

    const update: TgUpdate = await req.json();
    if (!checkUser(update, env)) return new Response('ok'); // silent drop

    ctx.waitUntil(handleMessage(update, env));
    return new Response('ok');
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runCron(event.cron, env));
  },
};
```

### MCP server config (Phase 4)
```ts
function buildMcpServers(env: Env) {
  return [
    { type: 'url', url: 'https://mcp.notion.com/mcp', name: 'notion',
      authorization_token: env.NOTION_TOKEN },
    { type: 'url', url: env.TELEGRAM_MCP_URL, name: 'telegram' },
    // Google added in Phase 7
  ];
}
```

### Telegram chunking (Phase 2)
```ts
const MAX = 4000; // safety margin under 4096
async function sendChunked(env: Env, chatId: number, text: string) {
  for (let i = 0; i < text.length; i += MAX) {
    await tgSend(env, chatId, text.slice(i, i + MAX));
  }
}
```

## 10. Testing approach

- **Unit**: auth check, chunking, MCP config builder, OAuth refresh logic.
- **Integration** (Miniflare): full handler with mocked Anthropic + Telegram fetches.
- **Manual**: each phase ends with manual Telegram smoke test against deployed Worker.
- No live MCP integration tests (rate limits, side effects). Mock at the fetch layer.

## 11. Deployment

```bash
# one-time
wrangler login
wrangler kv namespace create CONV
wrangler kv namespace create OAUTH
# (paste IDs into wrangler.toml)

# secrets
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_WEBHOOK_SECRET
wrangler secret put ALLOWED_USER_ID
wrangler secret put ANTHROPIC_API_KEY
# (etc — see secrets inventory)

# deploy
wrangler deploy

# register Telegram webhook (one-time, repeat if URL changes)
curl -X POST "https://api.telegram.org/bot${TOKEN}/setWebhook" \
  -d "url=https://YOUR-WORKER.workers.dev/webhook" \
  -d "secret_token=${WEBHOOK_SECRET}" \
  -d "drop_pending_updates=true"
```

## 12. Operational runbook

- **Logs**: `wrangler tail` for live tail. Don't log content.
- **Rotate secrets**: re-run `wrangler secret put`, redeploy. Telegram webhook secret rotation = re-run `setWebhook`.
- **Reset conversation**: `/reset` in chat, or `wrangler kv key delete --namespace-id=... chat:{id}`.
- **Pause bot**: `setWebhook` with empty URL, or set a `PAUSED=1` env var checked at top of handler.
- **Token refresh failure** (Google): re-run `/oauth/google/start`.

## 13. Cost projection

- Workers Paid: $5/mo (covers 10M requests, ample).
- KV: free tier covers personal volume.
- Anthropic API: variable, depends on use. Budget alert at $20/mo to start.
- Telegram: free.

**Total floor: ~$5/mo. Realistic: $10–30/mo with normal Claude use.**

## 14. Gotchas to remember

- Workers free tier won't sustain `waitUntil` past response — Paid required.
- Telegram webhook must return within 60s. Always ack-and-defer for Claude calls.
- `MarkdownV2` parse mode requires escaping `_*[]()~`>#+-=|{}.!`. Use `HTML` parse mode.
- `mcp_servers` parameter may need `anthropic-beta` header. Check current docs at build time.
- KV is eventually consistent globally. Fine for conversation state, not for locks.
- Telegram updates can be duplicated on retry — idempotency by `update_id` if needed.
- Don't log payloads even in dev — easy to forget to strip later.

## 15. Open decisions deferred to v2

- File / image input from Telegram → Claude vision.
- Approval gates for destructive actions (e.g. send email requires confirmation).
- Multi-conversation threading per chat.
- Long-running task queue (Cloudflare Queues + Durable Objects).
- Persistent memory layer (own KV vs claude.ai).
- Voice notes via Whisper (Worker → R2 → transcription service → Claude).

---

## CLAUDE.md companion (drop alongside this file)

> Personal context for Claude Code working on this repo.

```md
# Project: Telegram Claude Orchestrator

Personal AI orchestration layer running on Cloudflare Workers. Telegram is the only interface. See PLAN.md for full plan.

## Owner
Ben — Singapore. Top-down thinker. Wants short, structured responses. Tools first, results, stop.

## Stack
- Cloudflare Workers (Paid plan)
- TypeScript
- Wrangler 4.x
- Workers KV for state
- Anthropic Messages API + MCP servers
- Telegram Bot API (no library, raw fetch)

## Conventions
- No body logging anywhere.
- Every KV write to `CONV` namespace must have `expirationTtl: 86400`.
- Auth gate at top of every handler. Silent drop for unauthorized users (no error response).
- Ack-and-defer pattern for any Claude call (return 200, do work in `ctx.waitUntil`).
- HTML parse mode for Telegram, never MarkdownV2.
- Secrets via `wrangler secret put`, never in code or `wrangler.toml`.

## Build order
Follow PLAN.md phases 1→7. Don't skip ahead. Each phase ends with a manual Telegram smoke test.

## Don't
- Don't add libraries unless they earn their weight (no `node-telegram-bot-api` etc).
- Don't log message content or MCP responses.
- Don't echo input on auth failure.
- Don't bypass the ack-and-defer pattern even for "fast" calls.
```
