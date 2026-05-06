---
phase: 01-infrastructure-foundation
plan: 02
subsystem: infra
tags: [auth, telegram, commands, vitest]

# Dependency graph
requires:
  - phase: 01-infrastructure-foundation/01
    provides: "Project scaffold (tsconfig, eslint, prettier, vitest, types.ts, logger)"
provides:
  - "Auth module at src/lib/auth.ts (checkWebhookSignature, checkUserAllowed)"
  - "Telegram client at src/lib/telegram.ts (tgSend, tgSendChatAction, chunkMessage)"
  - "Command router at src/lib/commands.ts (routeCommand with /help, /ping)"
  - "All core library modules tested (19 tests across 3 files)"
affects: [01-infrastructure-foundation/03, 01-infrastructure-foundation/04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Map<string, CommandHandler> registry for slash command routing"
    - "vi.mock for isolating module dependencies in command tests"

key-files:
  created:
    - src/lib/auth.ts
    - src/lib/telegram.ts
    - src/lib/commands.ts
    - test/commands.test.ts
  modified:
    - test/auth.test.ts
    - test/chunking.test.ts

key-decisions:
  - "Verbatim port of auth.ts and telegram.ts from src/core/ to src/lib/ (zero logic changes, only import paths)"
  - "Deleted old CF Workers layout (src/core/, src/handlers/, src/index.ts) after port"

patterns-established:
  - "Map<string, CommandHandler> registry: add new commands by adding entries to the Map"
  - "routeCommand returns boolean: true = handled, false = pass through to AI"
  - "Library modules in src/lib/ with ../types.js relative import pattern"

requirements-completed: [INFRA-04, INFRA-05, INFRA-08, INFRA-10]

# Metrics
duration: 2min
completed: 2026-05-06
---

# Phase 1 Plan 02: Core Library Modules Summary

**Auth, Telegram client, and command router ported to src/lib/ with Map-based /help and /ping routing**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-06T04:19:14Z
- **Completed:** 2026-05-06T04:21:24Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Auth module (signature check + user allowlist) ported to src/lib/auth.ts
- Telegram client (tgSend, tgSendChatAction, chunkMessage) ported to src/lib/telegram.ts
- Slash command router created with Map registry, /help and /ping handlers
- All 19 tests pass (7 auth + 6 chunking + 6 commands)
- Old CF Workers layout deleted (src/core/, src/handlers/, src/index.ts)

## Task Commits

Each task was committed atomically:

1. **Task 1: Port auth.ts and telegram.ts to src/lib/, update test imports** - `8f7d441` (feat)
2. **Task 2: Create command router with /help and /ping, add tests** - `3cd9163` (feat)

## Files Created/Modified
- `src/lib/auth.ts` - Webhook signature check + user ID allowlist (ported from src/core/)
- `src/lib/telegram.ts` - tgSend, tgSendChatAction, chunkMessage (ported from src/core/)
- `src/lib/commands.ts` - Slash command router with Map<string, CommandHandler> registry
- `test/auth.test.ts` - Updated import path to src/lib/auth.js
- `test/chunking.test.ts` - Updated import path to src/lib/telegram.js
- `test/commands.test.ts` - New: 6 test cases for command routing
- `src/core/auth.ts` - Deleted (old CF Workers layout)
- `src/core/telegram.ts` - Deleted (old CF Workers layout)
- `src/handlers/telegram.ts` - Deleted (old CF Workers layout)
- `src/index.ts` - Deleted (old CF Workers entry point, rewritten in Plan 03)

## Decisions Made
None - followed plan as specified.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prettier formatting on commands.ts**
- **Found during:** Task 2 (commit attempt)
- **Issue:** lefthook pre-commit hook rejected commit due to Prettier formatting differences in commands.ts (multi-line function signature vs single-line)
- **Fix:** Ran `npx prettier --write src/lib/commands.ts` to auto-format
- **Files modified:** src/lib/commands.ts
- **Verification:** Pre-commit hook passed on second commit attempt
- **Committed in:** 3cd9163 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Formatting-only fix. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All core library modules (auth, telegram, commands) are in src/lib/ and independently tested
- Ready for Plan 03 (Hono webhook handler) to import and wire these modules
- src/index.ts deleted; Plan 03 will create the new Hono app entry point

## Self-Check: PASSED

All created files verified present. All commit hashes found in git log.

---
*Phase: 01-infrastructure-foundation*
*Completed: 2026-05-06*
