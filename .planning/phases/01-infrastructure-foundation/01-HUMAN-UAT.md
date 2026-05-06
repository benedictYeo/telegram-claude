---
status: partial
phase: 01-infrastructure-foundation
source: [01-VERIFICATION.md]
started: 2026-05-06T12:40:00.000Z
updated: 2026-05-06T12:40:00.000Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. End-to-end Telegram message flow
expected: Deploy on Mac mini, send /ping to bot, receive "pong" reply. Send /help, receive command list. Send plain text, receive "Received. AI coming soon." Send photo/sticker, receive "Text only for now."
result: [pending]

### 2. PM2 crash recovery + reboot survival
expected: Kill tg-claude process via PM2, verify auto-restart. Run `sudo reboot`, verify PM2 processes come back online and /ping works after reboot.
result: [pending]

### 3. Sleep prevention overnight
expected: Leave Mac mini running overnight with display off. Check /ping the next morning — bot still responds. `pmset -g assertions` shows caffeinate preventing sleep.
result: [pending]

### 4. Tailscale Funnel public access
expected: `curl https://YOUR-FUNNEL-URL/health` returns "ok" from another machine. `curl -X POST https://YOUR-FUNNEL-URL/webhook -d '{}'` returns 401 (no auth header).
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
