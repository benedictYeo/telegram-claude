---
phase: 2
slug: conversation-core
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-06
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.4 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | LLM-02 | — | N/A | unit | `node -e "require('@anthropic-ai/sdk')"` | N/A | ⬜ pending |
| 02-01-02 | 01 | 1 | CONV-02 | — | N/A | unit | `npx tsc --noEmit` | N/A | ⬜ pending |
| 02-01-03 | 01 | 1 | CONV-02,LLM-02 | — | N/A | unit | `npx tsc --noEmit && npm test` | N/A | ⬜ pending |
| 02-01-04 | 01 | 1 | — | — | N/A | unit | `npm test` | ✅ W0 creates | ⬜ pending |
| 02-02-01 | 02 | 2 | CONV-01,CONV-02,CONV-04 | T-02-03 | Parameterized queries only | unit | `npx tsc --noEmit && npm test -- test/conversation.test.ts` | ✅ W0 stub → real | ⬜ pending |
| 02-02-02 | 02 | 2 | LLM-01,LLM-02 | T-02-04 | API key validation | unit | `npx tsc --noEmit && npm test -- test/router.test.ts` | ✅ W0 stub → real | ⬜ pending |
| 02-03-01 | 03 | 3 | CONV-01,CONV-02,LLM-01,LLM-02 | T-02-07 | N/A | unit | `npx tsc --noEmit && npm test` | N/A | ⬜ pending |
| 02-03-02 | 03 | 3 | CONV-03,CONV-04 | T-02-10 | N/A | unit | `npx tsc --noEmit && npm test` | ✅ (extend) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `test/conversation.test.ts` — Wave 0 stubs created in Plan 02-01 Task 4; real tests in Plan 02-02 Task 1
- [x] `test/router.test.ts` — Wave 0 stubs created in Plan 02-01 Task 4; real tests in Plan 02-02 Task 2
- [x] `vitest.config.ts` — `DB_PATH: ":memory:"` added in Plan 02-01 Task 3
- [x] `data/` directory — `mkdir -p data` in Plan 02-01 Task 1
- [x] Framework install: `npm install @anthropic-ai/sdk` in Plan 02-01 Task 1

---

## Sampling Continuity Verification

Consecutive implementation task windows (max 3 without behavioral verify):

| Window | Tasks | Behavioral Verify Count | Compliant |
|--------|-------|------------------------|-----------|
| 02-01-T1, 02-01-T2, 02-01-T3 | 3 | 2 (T1: node require, T3: npm test) | YES |
| 02-01-T3, 02-01-T4, 02-02-T1 | 3 | 3 (T3: npm test, T4: npm test, T1: npm test) | YES |
| 02-02-T1, 02-02-T2, 02-03-T1 | 3 | 3 (all: npm test) | YES |
| 02-03-T1, 02-03-T2 | 2 | 2 (both: npm test) | YES |

No window of 3 consecutive tasks has fewer than 2 behavioral automated verifications.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Multi-turn conversation continuity via Telegram | CONV-01 | End-to-end requires live Telegram + Claude API | Send 3 messages, verify Claude references prior context |
| Conversation survives app close/reopen | CONV-02 | Requires real time gap and Telegram app restart | Send message, close Telegram, reopen after 5 min, send follow-up |
| Typing indicator appears during Claude call | INFRA-07 | Visual verification in Telegram UI | Send message, observe typing indicator before response |

*If none: "All phase behaviors have automated verification."*

---

## Architectural Tier Compliance

| Function | Expected Tier | Actual Location | Compliant |
|----------|--------------|-----------------|-----------|
| loadContext | State | src/state/conversation.ts | YES |
| appendMessages | State | src/state/conversation.ts | YES |
| archiveConversation | State | src/state/conversation.ts | YES |
| getUsage | State | src/state/conversation.ts | YES |
| buildSystemPrompt | Core | src/core/router.ts | YES |
| chat | Core | src/core/router.ts | YES |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
