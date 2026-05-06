---
phase: 01-infrastructure-foundation
plan: 04
subsystem: deployment
tags: [pm2, setup, readme, mac-mini, tailscale]
dependency_graph:
  requires: [01-03]
  provides: [ecosystem-config, setup-script, readme]
  affects: [deployment, process-management]
tech_stack:
  added: [pm2, caffeinate, tailscale-funnel]
  patterns: [pm2-ecosystem-cjs, tsx-interpreter, sleep-prevention, launchd-startup]
key_files:
  created:
    - ecosystem.config.cjs
    - scripts/setup.sh
    - README.md
  modified: []
decisions:
  - "PM2 ecosystem config uses interpreter: node with --import tsx/esm (not interpreter: tsx) for reliable path resolution"
  - "caffeinate uses interpreter: none and absolute path /usr/bin/caffeinate (system binary, not Node.js)"
  - "setup.sh interactive prompts for pm2 startup sudo command and .env creation"
metrics:
  duration: 1m
  completed: "2026-05-06T04:33:39Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 0
---

# Phase 01 Plan 04: PM2 Ecosystem, Setup Script, and README Summary

PM2 ecosystem config with tsx interpreter and caffeinate companion; setup.sh automates Mac mini provisioning (PM2, pmset, launchd, logrotate, Tailscale Funnel, webhook); README documents full setup and operations.

## What Was Done

### Task 1: Create PM2 ecosystem config (0ccb522)
Created `ecosystem.config.cjs` with two PM2 apps:
- **tg-claude**: Runs `src/index.ts` via `node --import tsx/esm`, autorestart with max 10 restarts, 256M memory limit, `watch: false`
- **tg-claude-caffeinate**: Runs `/usr/bin/caffeinate -s` with `interpreter: "none"`, autorestart with max 100 restarts

### Task 2: Create setup script and README (e00eb59)
- **scripts/setup.sh**: Full Mac mini provisioning script covering prerequisites check (Node 20+, Tailscale), npm install, PM2 + tsx global install, pmset sleep prevention, .env check, PM2 start, pm2 startup launchd, pm2 save, pm2-logrotate, Tailscale Funnel setup, Telegram webhook registration via setWebhook API, and health check verification
- **README.md**: Complete documentation covering prerequisites, quick start, environment variables table, architecture diagram, bot commands, development commands, PM2 operations, and Tailscale Funnel usage

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

1. **tsx interpreter approach**: Used `interpreter: "node"` with `interpreter_args: "--import tsx/esm"` rather than `interpreter: "tsx"` -- more reliable when tsx is globally installed alongside node
2. **caffeinate absolute path**: Used `/usr/bin/caffeinate` for the script path -- macOS system binary, always at this location
3. **Interactive setup prompts**: setup.sh uses `read -p` prompts at two points (after .env creation hint and after pm2 startup sudo command) -- necessary because these steps require manual user action

## Commit Log

| Task | Commit | Message |
|------|--------|---------|
| 1 | 0ccb522 | feat(01-04): create PM2 ecosystem config |
| 2 | e00eb59 | feat(01-04): create setup script and README |

## Self-Check: PASSED

All 3 files exist (ecosystem.config.cjs, scripts/setup.sh, README.md). setup.sh is executable. Both task commits verified in git log.
