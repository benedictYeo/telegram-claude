---
phase: 01-infrastructure-foundation
plan: "03"
subsystem: http-server
tags: [hono, webhook, ack-and-defer, routes, integration-tests]
dependency_graph:
  requires:
    - 01-01 (types, logger, project scaffold)
    - 01-02 (auth, telegram, commands libs)
  provides:
    - Hono HTTP app with /health, /webhook, 404 catch-all
    - Telegram webhook handler with ack-and-defer pattern
    - getEnv() helper for Node.js process.env to typed Env mapping
    - Integration test patterns using supertest + getRequestListener
  affects:
    - src/index.ts (new file — app entry point)
    - src/routes/telegram.ts (new file — webhook handler)
    - src/env.ts (new file — environment helper)
    - vitest.config.ts (updated — test env vars)
tech_stack:
  added: []
  patterns:
    - Hono app with @hono/node-server serve()
    - setImmediate() for ack-and-defer (replaces CF Workers waitUntil)
    - getRequestListener bridge for supertest integration tests
    - NODE_ENV guard to prevent serve() during tests
key_files:
  created:
    - src/index.ts
    - src/routes/telegram.ts
    - src/env.ts
    - test/routes.test.ts
    - test/errors.test.ts
  modified:
    - vitest.config.ts
decisions:
  - "getEnv() helper instead of c.env for Node.js: @hono/node-server populates c.env with HTTP bindings (incoming/outgoing), not process.env. Created src/env.ts to bridge."
  - "getRequestListener from @hono/node-server for supertest bridge instead of manual createServer wrapper — cleaner, official API."
  - "Mock logger in all route tests to prevent pino-pretty transport initialization during tests."
  - "Use TgMessage type directly for processUpdate parameter instead of inline type literal."
metrics:
  duration: 4m
  completed: "2026-05-06T04:28:49Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 5
  files_modified: 1
  tests_added: 11
  tests_total: 30
---

# Phase 01 Plan 03: Hono App Entry + Webhook Handler Summary

Hono HTTP server with ack-and-defer webhook handler, two-layer auth, slash command dispatch, typing indicator, and error handling via setImmediate fire-and-forget.

## What Was Built

### src/index.ts — Hono App Entry Point
- `import "dotenv/config"` as first import (Pitfall 5 from RESEARCH.md)
- `GET /health` returns 200 "ok" with no info disclosure (INFRA-09)
- `POST /webhook` delegates to telegramWebhook handler
- `app.all("*")` catch-all returns 404
- `export { app }` for test imports
- `serve()` guarded by `NODE_ENV !== "test"` to prevent port binding in tests

### src/routes/telegram.ts — Webhook Handler
- Layer 1: `checkWebhookSignature()` — 401 on fail (INFRA-04)
- Layer 2: `checkUserAllowed()` — silent 200 drop (INFRA-05)
- JSON parse with try/catch — silent 200 on bad body
- `setImmediate()` fires async processUpdate, returns 200 immediately (INFRA-06)
- processUpdate flow: non-text -> "Text only for now." (D-15), slash commands -> routeCommand (INFRA-10), typing indicator (INFRA-07), placeholder "Received. AI coming soon." (D-16)
- Error catch: `logger.error({ type })` + `tgSend("Something failed.")` (INFRA-11)

### src/env.ts — Environment Helper
- `getEnv()` reads `process.env` into typed `Env` object
- Required because `@hono/node-server` populates `c.env` with HTTP bindings, not app secrets

### Test Suite (11 new tests, 30 total)
- `test/routes.test.ts`: /health (200, no disclosure), /webhook (401 bad sig, 401 wrong sig, 200 valid, 200 silent drop), 404 catch-all (GET and POST)
- `test/errors.test.ts`: ack-and-defer returns 200 even on failure, generic error message sent to user, error type logged without message content

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Hono c.env does not contain app secrets on Node.js**
- **Found during:** Task 1
- **Issue:** `@hono/node-server` populates `c.env` with `{ incoming, outgoing }` (Node HTTP objects), not `process.env`. The plan assumed `c.env.TELEGRAM_WEBHOOK_SECRET` would work.
- **Fix:** Created `src/env.ts` with `getEnv()` that reads `process.env` into a typed `Env` object. Handler calls `getEnv()` instead of `c.env`.
- **Files modified:** src/env.ts (new), src/routes/telegram.ts (uses getEnv())
- **Commit:** e5a1743

**2. [Rule 3 - Blocking] supertest bridge for Hono**
- **Found during:** Task 2
- **Issue:** Plan's manual `createServer` wrapper was verbose. `@hono/node-server` exports `getRequestListener` which cleanly bridges Hono's fetch handler to Node HTTP.
- **Fix:** Used `getRequestListener(app.fetch)` as the supertest server factory — official, clean, one-liner.
- **Files modified:** test/routes.test.ts, test/errors.test.ts
- **Commit:** 85fff63

**3. [Rule 3 - Blocking] Logger mock needed in route tests**
- **Found during:** Task 2
- **Issue:** Importing `src/index.ts` triggers `src/lib/logger.ts` which initializes pino-pretty transport. This works but adds noise and potential timing issues in tests.
- **Fix:** Mock logger in both route test files to isolate test output.
- **Files modified:** test/routes.test.ts, test/errors.test.ts
- **Commit:** 85fff63

## Known Stubs

| Stub | File | Line | Reason | Resolves In |
|------|------|------|--------|-------------|
| "Received. AI coming soon." | src/routes/telegram.ts | 65 | D-16: intentional Phase 1 placeholder | Phase 2 (Conversation Core) |

## Verification Results

- `npx tsc` — zero type errors
- `npx vitest run` — 30 tests passing across 5 files
- GET /health returns 200 "ok"
- POST /webhook without secret returns 401
- POST /webhook with valid auth returns 200

## Self-Check: PASSED

All 5 created files verified on disk. Both commit hashes (e5a1743, 85fff63) verified in git log.
