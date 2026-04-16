# CLAUDE.md — Project Context for Claude Code

Personal AI orchestration layer running on Cloudflare Workers. Telegram is the only interface.

## Read first
1. `PLAN.md` — strategy, architecture, security model.
2. `TASKS.md` — granular execution checklist. Source of truth for what to build next.
3. This file — operating conventions while working in the repo.

## Owner
Ben — Singapore. Top-down thinker. Wants short, structured responses. Tools first, results, stop. No filler.

## How to work in this repo

**Always:**
- Check `TASKS.md` to find current phase. Tick boxes as you complete tasks.
- One phase at a time. Stop at phase boundary for manual smoke test.
- One commit per logical task group (~3-7 ticked boxes).
- Commit message format: `feat(phase-N): <what shipped>` or `fix(phase-N): <what>`.

**Never:**
- Skip phases or pull tasks forward.
- Add libraries that don't earn their weight (no `node-telegram-bot-api`, no `axios`, etc — use raw `fetch`).
- Log message content, MCP responses, or any user payload.
- Echo input on auth failure (silent drop only).
- Bypass the ack-and-defer pattern, even for "fast" calls.
- Put secrets in code, `wrangler.toml`, or `.env` (use `wrangler secret put`).

## Stack constraints

- Cloudflare Workers (Paid plan, $5/mo)
- TypeScript strict mode
- Wrangler 4.x
- Workers KV for state
- Anthropic Messages API + MCP servers
- Telegram Bot API (raw `fetch`, no library)
- Vitest with `@cloudflare/vitest-pool-workers`

## Hard rules

1. Every KV write to `CONV` must include `expirationTtl: 86400`.
2. Auth gate at top of every handler. Return 401 on bad signature, silent 200 drop on bad user.
3. Telegram webhook returns within 60s — always `ctx.waitUntil` for Claude calls.
4. HTML parse mode for Telegram, never MarkdownV2.
5. Chunk Telegram messages at 4000 chars (safety margin under 4096).
6. Errors to user: generic icon + short message (`⚠️ something failed`). Real error logged by type only.
7. No `update_id` reprocessing — idempotency via KV cache (Phase 8).

## Communication style when responding to Ben

Mirror his style: short 3–6 word sentences. Direct answers. Tools first, show results, stop. No narration. No filler words (the, is, am, are dropped where natural). When asking clarifying questions, prefer interactive options over prose questions.

## When stuck

- If a Cloudflare or Anthropic API behavior is unclear, search current docs (don't rely on training).
- If a phase's acceptance criterion can't be met, stop and ask Ben — don't paper over.
- If you find yourself reaching for a heavy dependency, propose it first with rationale.

## Out of scope (v1)

See `PLAN.md` §2 (Non-goals) and `TASKS.md` Backlog. Do not pull these in without a written decision.
