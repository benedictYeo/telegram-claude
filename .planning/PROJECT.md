# Telegram Claude Orchestrator

## What This Is

A personal AI orchestration layer running on a Mac mini, accessible exclusively via Telegram. An always-on agent that manages a second brain (Obsidian vault), orchestrates external services (Google, GitHub), runs scheduled tasks, and supports extensible skills — inspired by OpenClaw and Hermes. Model-flexible: can use Claude, OpenAI, or local models on UNRAID.

## Core Value

Always-accessible AI assistant that can read/write my second brain and orchestrate services on my behalf — from anywhere, via Telegram.

## Requirements

### Validated

- [x] Telegram webhook signature verification — existing
- [x] Single-user auth gate (user ID allowlist) — existing
- [x] Telegram message send + chunking — existing
- [x] Health check endpoint — existing

### Active

- [ ] Chat with AI via Telegram (model-flexible: Claude, OpenAI, local)
- [ ] Ack-and-defer pattern (respond immediately, process async)
- [ ] Conversation state with TTL
- [ ] Obsidian vault read/write (daily notes, journal, quick capture)
- [ ] Obsidian vault search and summarize ("what did I learn this week?")
- [ ] Google Calendar integration (read events, check availability)
- [ ] Gmail integration (read, search, draft replies)
- [ ] GitHub integration (PRs, issues, CI status, notifications)
- [ ] MCP server connections (extensible tool integrations)
- [ ] Skills system — teachable via chat ("when I say X, do Y")
- [ ] Skills system — file-based (markdown workflow definitions)
- [ ] Scheduled tasks (morning brief, evening digest)
- [ ] Webhook ingress (external services push alerts via HTTP)
- [ ] Model switching per-task (cloud for quality, local for simple/private)

### Out of Scope

- Multi-user / family access — single user only (Ben)
- Voice input/output — text-only v1
- File/image generation back to Telegram — text only v1
- Mobile app — Telegram is the interface
- Web dashboard — CLI/Telegram only for v1
- Persistent long-term memory beyond Obsidian — Obsidian IS the memory

## Context

**Existing code:** Phase 1 echo bot deployed on Cloudflare Workers. Auth patterns (webhook signature, user allowlist) and Telegram API integration (sendMessage, chunking, typing indicators) are validated. Runtime is shifting from CF Workers to Mac mini — core patterns transfer but need adaptation for a Node.js server.

**Infrastructure:** Mac mini (always-on) with Tailscale already set up. UNRAID server available for local model inference (Ollama/vLLM). Obsidian vault on Mac mini synced via Obsidian Sync.

**Second brain workflow:** Quick capture throughout the day ("log this: had an idea about X" appends to daily note), structured review on demand ("what did I learn this week?" reads recent notes and summarizes). Obsidian vault accessed directly via filesystem on Mac mini.

**Inspiration:** OpenClaw (https://openclaw.ai/) and Hermes (https://hermes-agent.nousresearch.com/) — always-on personal agents with teachable skills and multi-service orchestration.

## Constraints

- **Runtime**: Mac mini (always-on), exposed via Tailscale Funnel — no port forwarding
- **Language**: Polyglot — TypeScript for Telegram bot/orchestration core, Python for AI/ML integrations and local model support
- **Auth**: Single user only — Ben's Telegram user ID
- **Obsidian access**: Direct filesystem access on Mac mini (Obsidian Sync has no API)
- **Security**: No content logging. Secrets in env vars or secret manager, never in code.
- **Interface**: Telegram only. HTML parse mode, never MarkdownV2.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Mac mini over Cloudflare Workers | Direct Obsidian vault access, no runtime limits, supports local models, no cloud costs | -- Pending |
| Tailscale Funnel over Cloudflare Tunnel | Already running Tailscale, no domain needed, built-in HTTPS | -- Pending |
| Polyglot (TS + Python) | TypeScript for bot/MCP ecosystem strengths, Python for AI/ML ecosystem strengths | -- Pending |
| Model-flexible (not Claude-only) | Ability to use best model per task, run local models for private/simple tasks | -- Pending |
| Skills as composable workflows over MCP tools | Skills orchestrate multiple MCP tools, more expressive than single tool calls | -- Pending |
| Obsidian over Notion for second brain | User's existing vault, local-first, markdown-native | -- Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-06 after initialization*
