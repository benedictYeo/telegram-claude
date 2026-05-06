---
phase: 01-infrastructure-foundation
verified: 2026-05-06T12:45:00Z
status: human_needed
score: 5/5 must-haves verified (code-level)
overrides_applied: 0
human_verification:
  - test: "Deploy to Mac mini and verify Telegram messages get responses"
    expected: "/ping replies 'pong', plain text replies 'Received. AI coming soon.', photo replies 'Text only for now.'"
    why_human: "Requires physical Mac mini + Tailscale Funnel + real Telegram bot -- cannot verify programmatically from this machine"
  - test: "PM2 crash recovery and reboot survival"
    expected: "pm2 stop tg-claude + pm2 start restores service; sudo reboot brings PM2 processes back online"
    why_human: "Requires PM2 running on Mac mini with launchd plist installed"
  - test: "Mac mini stays awake overnight with display off"
    expected: "/ping still responds the next morning"
    why_human: "Physical hardware test requiring overnight observation"
  - test: "Tailscale Funnel public HTTPS access"
    expected: "curl https://YOUR-FUNNEL-URL/health returns 'ok'; /webhook without secret returns 401"
    why_human: "Requires Tailscale Funnel configured on Mac mini"
---

# Phase 1: Infrastructure Foundation Verification Report

**Phase Goal:** An always-on, authenticated HTTP server runs on Mac mini under PM2, never sleeps, receives Telegram webhooks, and responds safely
**Verified:** 2026-05-06T12:45:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

Truths derived from ROADMAP.md Success Criteria (SC) and plan must_haves.

| # | Truth (from Roadmap SC) | Status | Evidence |
|---|-------------------------|--------|----------|
| 1 | Sending a message from Ben's Telegram account gets a 200 response within 1s; messages from other accounts are silently dropped | VERIFIED (code) | `src/routes/telegram.ts:25` checkUserAllowed returns silent 200; `test/routes.test.ts:88-95` tests unauthorized user gets 200 silently; valid user gets 200 ok. ack-and-defer via setImmediate returns immediately. |
| 2 | Mac mini can be left overnight with display off and the server is still responding in the morning (PM2 + sleep prevention) | VERIFIED (code) | `ecosystem.config.cjs:21-28` caffeinate -s as PM2 companion process with interpreter: "none"; `scripts/setup.sh:45` runs `sudo pmset -a sleep 0 disksleep 0 displaysleep 0`. Both mechanisms present. **Requires physical deployment to confirm.** |
| 3 | A tampered webhook signature returns 401; /health returns 200 with no sensitive info | VERIFIED (code+tests) | `src/lib/auth.ts:4-7` checks X-Telegram-Bot-Api-Secret-Token, returns 401 on mismatch; `test/routes.test.ts:66-77` tests both missing and wrong secret -> 401; `test/routes.test.ts:35-46` /health returns 200 "ok" only, no version/node info. |
| 4 | Slash commands routed before AI dispatch; messages exceeding 4000 chars chunked | VERIFIED (code+tests) | `src/routes/telegram.ts:57-59` routeCommand runs before typing indicator and AI placeholder; `src/lib/telegram.ts:4` MAX_CHUNK = 4000; `test/chunking.test.ts` 6 tests covering edge cases; `test/commands.test.ts` 6 tests covering /ping, /help, unknown passthrough. |
| 5 | Server auto-restarts after crash (PM2) and survives reboot (launchd) | VERIFIED (code) | `ecosystem.config.cjs:11` autorestart: true, max_restarts: 10; `scripts/setup.sh:76` pm2 startup launchd; `scripts/setup.sh:82` pm2 save. All configuration present. **Requires physical deployment to confirm.** |

**Score:** 5/5 truths verified at code level

**Note:** All 5 truths pass code-level verification (artifacts exist, are substantive, and are wired). However, SC-2 and SC-5 require physical Mac mini deployment to fully confirm. Plan 01-05 (deployment smoke test) was deferred by the user.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `package.json` | All Phase 1 deps (hono, tsx, pino, better-sqlite3, etc.) | VERIFIED | Contains hono, @hono/node-server, tsx, dotenv, pino, better-sqlite3 in dependencies; ESLint, Prettier, lefthook, vitest, typescript in devDependencies; `"type": "module"`; no @cloudflare/* or wrangler |
| `tsconfig.json` | Node.js-targeted (no CF Workers types) | VERIFIED | `"types": ["node"]`, no @cloudflare/workers-types, strict: true, ES2022 target |
| `src/types.ts` | Clean Env interface + Telegram types | VERIFIED | Env has 4 fields (no KVNamespace, no WEBHOOK_SECRET); TgUser, TgChat, TgMessage, TgCallbackQuery, TgUpdate all present |
| `src/lib/logger.ts` | pino logger singleton | VERIFIED | Exports `logger`, pino import, production/dev transport switching, 7 lines substantive |
| `src/lib/auth.ts` | Webhook signature check + user ID allowlist | VERIFIED | Exports checkWebhookSignature (Response or null), checkUserAllowed (boolean), imports Env and TgUpdate from types |
| `src/lib/telegram.ts` | Telegram API client (send, chat action, chunking) | VERIFIED | Exports tgSend, tgSendChatAction, chunkMessage; MAX_CHUNK = 4000; raw fetch to Telegram API; 41 lines substantive |
| `src/lib/commands.ts` | Slash command router with /help and /ping | VERIFIED | Exports routeCommand; Map<string, CommandHandler> registry; /help and /ping handlers; unrecognized returns false; 30 lines substantive |
| `src/index.ts` | Hono app entry point with serve() on port 3000 | VERIFIED | dotenv/config first import; Hono app with /health, /webhook, 404 catch-all; serve() guarded by NODE_ENV !== "test"; exports app for testing |
| `src/routes/telegram.ts` | POST /webhook handler with ack-and-defer | VERIFIED | Exports telegramWebhook; checkWebhookSignature + checkUserAllowed; setImmediate for ack-and-defer; processUpdate with non-text hint, command routing, typing indicator, AI placeholder; error catch with generic message + type-only logging |
| `src/env.ts` | Environment helper (getEnv) | VERIFIED | Exports getEnv; maps process.env to typed Env; deviation from plan (c.env doesn't work on Node.js) but achieves same purpose |
| `ecosystem.config.cjs` | PM2 process config for tg-claude + caffeinate | VERIFIED | Two apps: tg-claude (src/index.ts, node --import tsx/esm, autorestart, 256M limit, watch:false) and tg-claude-caffeinate (/usr/bin/caffeinate -s, interpreter: "none") |
| `scripts/setup.sh` | Mac mini setup script | VERIFIED | Executable; set -euo pipefail; checks Node 20+ and Tailscale; npm install -g pm2 tsx; pmset sleep prevention; pm2 start/startup/save; pm2-logrotate; tailscale funnel; webhook registration; health check |
| `README.md` | Setup documentation | VERIFIED | Documents prerequisites, quick start, env vars table, architecture, commands (/ping, /help), development, PM2 operations, Tailscale Funnel |
| `.env.example` | Secret template | VERIFIED | Contains TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, ALLOWED_USER_ID, ANTHROPIC_API_KEY, PORT, NODE_ENV |
| `eslint.config.js` | ESLint flat config with TypeScript + Prettier | VERIFIED | Uses @eslint/js, typescript-eslint, eslint-config-prettier; flat config format |
| `.prettierrc` | Formatting config | VERIFIED | double quotes, semicolons, trailing commas, 2-space indent, 100 print width |
| `lefthook.yml` | Git pre-commit hooks | VERIFIED | Pre-commit parallel: lint, format check, typecheck |
| `vitest.config.ts` | Test config with env vars | VERIFIED | Environment "node"; test env vars for TELEGRAM_WEBHOOK_SECRET, ALLOWED_USER_ID, NODE_ENV=test, PORT=0 |
| `test/auth.test.ts` | Auth module tests | VERIFIED | 7 tests: signature valid/wrong/missing, user allowed/rejected/callback_query/no-from |
| `test/chunking.test.ts` | Chunking tests | VERIFIED | 6 tests: empty, single, exact max, max+1, 12000, custom max |
| `test/commands.test.ts` | Command router tests | VERIFIED | 6 tests: non-slash, unknown slash, /ping, /help, case-insensitive, arguments |
| `test/routes.test.ts` | Integration tests | VERIFIED | 7 tests: /health 200, no info disclosure, /webhook 401 missing, 401 wrong, 200 valid, 200 silent drop, 404 catch-all (2 tests) |
| `test/errors.test.ts` | Error handling tests | VERIFIED | 3 tests: 200 on future failure, generic error message sent, error type logged without content |
| `archive/` | Old CF Workers code | VERIFIED | Contains src/, wrangler.toml, README.md |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/index.ts` | `src/routes/telegram.ts` | `app.post("/webhook", telegramWebhook)` | WIRED | Line 4: imports telegramWebhook; Line 13: `app.post("/webhook", telegramWebhook)` |
| `src/routes/telegram.ts` | `src/lib/auth.ts` | checkWebhookSignature + checkUserAllowed | WIRED | Line 3: imports both; Lines 13-14, 25: both called in handler |
| `src/routes/telegram.ts` | `src/lib/commands.ts` | routeCommand | WIRED | Line 5: import; Line 58: `routeCommand(text, chatId, env)` called in processUpdate |
| `src/routes/telegram.ts` | `src/lib/telegram.ts` | tgSend + tgSendChatAction | WIRED | Line 4: imports both; Lines 39, 51, 62, 65: called in processUpdate and error handler |
| `src/routes/telegram.ts` | `src/env.ts` | getEnv() | WIRED | Line 7: import; Line 10: `const env = getEnv()` |
| `src/routes/telegram.ts` | `src/lib/logger.ts` | logger.error | WIRED | Line 6: import; Line 38: `logger.error({ type: ... })` |
| `src/lib/commands.ts` | `src/lib/telegram.ts` | import tgSend | WIRED | Line 2: `import { tgSend } from "./telegram.js"`; Lines 21, 25: called in handlers |
| `ecosystem.config.cjs` | `src/index.ts` | script: "src/index.ts" with tsx interpreter | WIRED | Line 7: `script: "src/index.ts"`; Line 9: `interpreter_args: "--import tsx/esm"` |
| `scripts/setup.sh` | `ecosystem.config.cjs` | pm2 start ecosystem.config.cjs | WIRED | Line 70: `pm2 start ecosystem.config.cjs` |

### Data-Flow Trace (Level 4)

Not applicable for Phase 1 -- no dynamic data rendering. The webhook handler receives Telegram updates and dispatches responses via raw fetch. Data flows through function parameters (env, chatId, text), not through state/store patterns.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compiles clean | `npx tsc` | Zero errors (empty output) | PASS |
| All tests pass | `npx vitest run` | 30 tests passed across 5 files (332ms) | PASS |
| ESLint passes | `npx eslint src/ test/` | Clean (no output) | PASS |
| Prettier passes | `npx prettier --check src/ test/` | "All matched files use Prettier code style!" | PASS |
| ecosystem.config.cjs loadable | `node -e "require('./ecosystem.config.cjs')"` | Returns 2 apps: tg-claude, tg-claude-caffeinate | PASS |
| setup.sh is executable | `test -x scripts/setup.sh` | Pass | PASS |
| wrangler.toml absent from root | `test ! -f wrangler.toml` | Pass | PASS |
| Old CF layout deleted | `ls src/core/ src/handlers/` | Both do not exist | PASS |
| Server start (live) | N/A | SKIP -- requires running server; deferred to Mac mini deployment | SKIP |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| INFRA-01 | 01-03, 01-04, 01-05 | Server runs on Mac mini via Node.js, exposed via Tailscale Funnel | SATISFIED (code) | src/index.ts: Hono + @hono/node-server serve(); ecosystem.config.cjs: PM2 config; scripts/setup.sh: Tailscale Funnel setup; README.md documents architecture. **Deployment pending.** |
| INFRA-02 | 01-04, 01-05 | PM2 manages process lifecycle with auto-restart on crash and reboot | SATISFIED (code) | ecosystem.config.cjs: autorestart: true, max_restarts: 10; scripts/setup.sh: pm2 startup launchd + pm2 save. **Deployment pending.** |
| INFRA-03 | 01-04, 01-05 | Mac mini sleep prevention configured | SATISFIED (code) | ecosystem.config.cjs: caffeinate -s companion; scripts/setup.sh: sudo pmset -a sleep 0 disksleep 0 displaysleep 0. **Deployment pending.** |
| INFRA-04 | 01-02, 01-03 | Auth gate verifies Telegram webhook secret header on every request | SATISFIED | src/lib/auth.ts: checkWebhookSignature returns 401; src/routes/telegram.ts: called first; test/auth.test.ts + test/routes.test.ts: 401 on bad/missing secret |
| INFRA-05 | 01-02, 01-03 | Auth gate silently drops messages from non-allowed user IDs | SATISFIED | src/lib/auth.ts: checkUserAllowed returns boolean; src/routes/telegram.ts: silent 200 on false; test/auth.test.ts + test/routes.test.ts: silent drop tested |
| INFRA-06 | 01-03 | Ack-and-defer pattern -- respond 200 immediately, process async | SATISFIED | src/routes/telegram.ts: setImmediate() fires processUpdate, returns c.text("ok"); test/routes.test.ts: 200 on valid request; test/errors.test.ts: 200 returned before failure |
| INFRA-07 | 01-03 | Typing indicator sent before every AI call | SATISFIED | src/routes/telegram.ts:62: `tgSendChatAction(env, chatId, "typing")` before AI placeholder |
| INFRA-08 | 01-02 | Message chunking at 4000 chars | SATISFIED | src/lib/telegram.ts: MAX_CHUNK = 4000, chunkMessage(); tgSend calls chunkMessage internally; test/chunking.test.ts: 6 tests |
| INFRA-09 | 01-03 | Health check endpoint (no auth, no info disclosure) | SATISFIED | src/index.ts:10: `app.get("/health", (c) => c.text("ok"))`; test/routes.test.ts: 200 "ok", no version/node info |
| INFRA-10 | 01-02, 01-03 | Slash-command routing (prefix match before AI dispatch) | SATISFIED | src/lib/commands.ts: routeCommand with Map registry; src/routes/telegram.ts:58: routeCommand called before typing/AI; test/commands.test.ts: 6 tests |
| INFRA-11 | 01-03 | Generic error feedback to user, real error logged by type only | SATISFIED | src/routes/telegram.ts:38: logger.error({ type }); line 39: tgSend("Something failed."); test/errors.test.ts: verifies generic message sent and type-only logging without content |

All 11 INFRA requirements are SATISFIED at code level. INFRA-01, INFRA-02, INFRA-03 additionally require deployment verification (Plan 01-05, deferred).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/routes/telegram.ts | 64-65 | `"Received. AI coming soon."` placeholder | INFO | Intentional Phase 1 stub per D-16. Replaced in Phase 2 when Claude integration is added. Not a gap. |
| src/env.ts | 5-8 | `process.env.X ?? ""` empty string defaults | INFO | If .env missing, all secrets default to empty string. No validation/startup check. Low risk: auth will reject all requests (empty secret never matches). Acceptable for Phase 1 -- setup.sh checks .env existence. |

### Human Verification Required

Plan 01-05 (deployment smoke test) was deferred by the user. The following items require physical Mac mini deployment and cannot be verified programmatically.

### 1. End-to-end Telegram message flow

**Test:** Deploy via `./scripts/setup.sh` on Mac mini. Send `/ping` to the bot in Telegram.
**Expected:** Bot replies "pong". Send plain text -- replies "Received. AI coming soon." Send photo -- replies "Text only for now."
**Why human:** Requires physical Mac mini, Tailscale Funnel, real Telegram bot, and network access.

### 2. PM2 crash recovery

**Test:** `pm2 stop tg-claude && pm2 start tg-claude`. Send `/ping`.
**Expected:** Bot responds after restart.
**Why human:** Requires PM2 running on Mac mini.

### 3. PM2 reboot survival

**Test:** `sudo reboot` the Mac mini. After reboot, `pm2 list` and send `/ping`.
**Expected:** Both tg-claude and tg-claude-caffeinate processes are online. Bot responds.
**Why human:** Requires physical reboot of Mac mini with launchd plist installed.

### 4. Sleep prevention overnight

**Test:** Leave Mac mini overnight with display off. Send `/ping` the next morning.
**Expected:** Bot responds. `pmset -g assertions` shows caffeinate preventing sleep.
**Why human:** Physical observation over 8+ hours.

### 5. Tailscale Funnel public access

**Test:** `curl https://YOUR-FUNNEL-URL/health` from another machine. `curl -X POST https://YOUR-FUNNEL-URL/webhook -d '{}'` without secret header.
**Expected:** /health returns "ok" (200). /webhook without secret returns 401.
**Why human:** Requires Tailscale Funnel configured and publicly accessible.

### Gaps Summary

No code-level gaps found. All 11 INFRA requirements are implemented, tested, and wired. All artifacts exist, are substantive, and are properly connected.

The single outstanding item is physical deployment verification (Plan 01-05), which was **deferred by the user**. This is not a code gap -- it is a deployment checkpoint that requires hands-on Mac mini access. The code is complete and ready for deployment.

**Disconfirmation pass (Thinking Model 3):**
1. **Partially met requirement:** INFRA-01 code is complete but never run on the target machine. Configuration could fail at deployment time (e.g., tsx interpreter path, Tailscale Funnel HTTPS prerequisite). This is the purpose of the deferred Plan 01-05.
2. **Test limitation:** `test/routes.test.ts` validates the 200 ack response but does not directly verify the deferred processUpdate executes (only `test/errors.test.ts` does via setTimeout wait). This is acceptable -- the async error path is tested.
3. **Uncovered error path:** `getEnv()` returns empty strings when env vars are unset, with no startup validation. In production, setup.sh checks for .env and auth rejects all requests if secret is empty. Acceptable for Phase 1.

---

_Verified: 2026-05-06T12:45:00Z_
_Verifier: Claude (gsd-verifier)_
