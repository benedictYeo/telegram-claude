---
phase: 1
slug: infrastructure-foundation
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-06
---

# Phase 1 -- Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-T1 | 01-01 | 1 | — | T-01-01 | .env.example has empty values | config | `npm install && npx tsc && npx eslint src/ test/ && npx prettier --check src/ test/` | N/A (config) | pending |
| 01-01-T2 | 01-01 | 1 | — | — | — | config | `npx tsc` | N/A (config) | pending |
| 01-02-T1 | 01-02 | 1 | INFRA-04, INFRA-05, INFRA-08 | T-01-03, T-01-04 | Sig check 401; silent drop 200; chunk at 4000 | unit | `npx vitest run test/auth.test.ts test/chunking.test.ts` | Yes (exist) | pending |
| 01-02-T2 | 01-02 | 1 | INFRA-10 | T-01-06 | Commands read-only | unit | `npx vitest run test/commands.test.ts` | Co-located | pending |
| 01-03-T1 | 01-03 | 2 | INFRA-01, INFRA-06, INFRA-07, INFRA-09 | T-01-07, T-01-08, T-01-09 | Auth gate; ack-and-defer; health no disclosure | config | `npx tsc` | N/A (source) | pending |
| 01-03-T2 | 01-03 | 2 | INFRA-06, INFRA-09, INFRA-11 | T-01-10 | Generic error msg; log type only | integration | `npx vitest run test/routes.test.ts test/errors.test.ts` | Co-located | pending |
| 01-04-T1 | 01-04 | 3 | INFRA-01, INFRA-02 | T-01-14 | PM2 restart limits | config | `node -e "require('./ecosystem.config.cjs')"` | N/A (config) | pending |
| 01-04-T2 | 01-04 | 3 | INFRA-02, INFRA-03 | T-01-12, T-01-13 | .env not committed; sudo documented | config | `test -x scripts/setup.sh` | N/A (script) | pending |
| 01-05-T1 | 01-05 | 3 | ALL | ALL | Full stack verification | manual | N/A — human checkpoint | N/A | pending |

*Status: pending -- pre-execution*

---

## Wave 0 and Co-Located Test Justification

**Nyquist compliance: true** -- with co-located test creation accepted for this phase.

### Why co-located tests are acceptable for Phase 1:

1. **Infrastructure/migration phase**: Phase 1 is primarily a migration from CF Workers to Node.js. The majority of tasks are configuration (package.json, tsconfig, ecosystem.config.cjs, setup.sh) and porting existing tested code. These are not pure logic tasks where test-first provides design feedback.

2. **Existing test coverage carries forward**: `test/auth.test.ts` and `test/chunking.test.ts` already exist from the CF Workers era. They cover INFRA-04, INFRA-05, and INFRA-08. These are updated (import paths only) in Wave 1 alongside the ported modules.

3. **New tests created alongside implementation in Wave 2**: `test/routes.test.ts`, `test/errors.test.ts`, and `test/commands.test.ts` are created in the same plan as the code they test. This is acceptable because:
   - The route/error tests require the Hono app to exist (they test HTTP integration, not pure logic)
   - The command tests require the command router module (mock-based unit tests)
   - Creating test stubs in a separate Wave 0 plan would add overhead without design benefit -- the tests cannot meaningfully run until the server module exists

4. **Manual verification covers the gaps**: INFRA-01, INFRA-02, INFRA-03 (server runs, PM2 restarts, sleep prevention) are inherently manual-only and verified in Plan 01-05's checkpoint.

5. **Every automated plan has `<verify>` commands**: All tasks include `<automated>` verification that runs after implementation. No task goes unverified.

---

## Wave 0 Requirements

- [x] `vitest.config.ts` -- Vitest config for Node.js environment (updated in Plan 01-03 Task 2 with test env vars)
- [x] `test/` directory -- test file structure (exists from CF Workers era)
- [x] `test/auth.test.ts` -- auth tests (exists, import paths updated in Plan 01-02)
- [x] `test/chunking.test.ts` -- chunking tests (exists, import paths updated in Plan 01-02)

*Test files for routes, errors, and commands are co-located with their implementation plans (01-02, 01-03) per justification above.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PM2 auto-restart after crash | INFRA-02 | Requires process kill on Mac mini | `pm2 stop tg-claude && pm2 start tg-claude` -- verify restart |
| Sleep prevention overnight | INFRA-03 | Requires overnight observation | Leave Mac mini overnight, check `/health` in morning |
| Tailscale Funnel HTTPS | INFRA-01 | Requires external network access | `curl https://<funnel-url>/health` from phone |
| Reboot survival | INFRA-02 | Requires Mac mini reboot | Reboot, verify PM2 + Tailscale restart |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (co-located tests justified above)
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved (co-located tests accepted for infrastructure/migration phase)
