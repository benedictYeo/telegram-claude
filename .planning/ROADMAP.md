# Roadmap: Telegram Claude Orchestrator

## Overview

Migration from Cloudflare Workers echo bot to a full personal AI orchestration layer on Mac mini. The build follows the architecture's critical path: stable always-on infrastructure first, then conversation core, then model flexibility, then second-brain access (Obsidian), then external integrations (MCP, skills, cron, webhooks, Gmail). Each phase delivers a coherent capability that stands on its own before the next layer is added.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Infrastructure Foundation** - Always-on Node.js server on Mac mini, fully authenticated, exposed via Tailscale Funnel
- [ ] **Phase 2: Conversation Core** - Multi-turn conversation with Claude, SQLite persistence, and ack-and-defer pattern
- [ ] **Phase 3: Model Router Expansion** - OpenAI and Ollama providers added; explicit model switching via commands
- [ ] **Phase 4: Obsidian Integration** - Read/write/search vault via filesystem; quick capture and daily note access
- [ ] **Phase 5: MCP Client Pool + Google Calendar** - Pooled MCP connections at startup; Google Calendar reads availability
- [ ] **Phase 6: Skills Registry** - File-based skills discovered, matched, and executed; teachable skills via chat
- [ ] **Phase 7: Cron Scheduler + Proactive Briefs** - Morning brief and evening digest sent on schedule, triggerable on demand
- [ ] **Phase 8: Webhook Ingress** - External services push alerts; GitHub events formatted and summarized by Claude
- [ ] **Phase 9: Gmail Integration** - Read and search Gmail; draft replies with approval gate before send

## Phase Details

### Phase 1: Infrastructure Foundation
**Goal**: An always-on, authenticated HTTP server runs on Mac mini under PM2, never sleeps, receives Telegram webhooks, and responds safely
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, INFRA-07, INFRA-08, INFRA-09, INFRA-10, INFRA-11
**Success Criteria** (what must be TRUE):
  1. Sending a message from Ben's Telegram account gets a 200 response within 1s; messages from other accounts are silently dropped
  2. Mac mini can be left overnight with display off and the server is still responding in the morning (PM2 + sleep prevention)
  3. A tampered webhook signature returns 401; the health endpoint `/health` returns 200 with no sensitive info
  4. Slash commands are routed before AI dispatch; a message exceeding 4000 chars is chunked and delivered in parts
  5. Server auto-restarts after a simulated crash (PM2) and survives a reboot (launchd integration)
**Plans**: 5 plans

Plans:
**Wave 1**
- [x] 01-01-PLAN.md — Project scaffold: dependencies, tsconfig, types, logger, ESLint/Prettier/lefthook
- [x] 01-02-PLAN.md — Port auth + telegram libs, create command router with /help and /ping

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 01-03-PLAN.md — Hono app entry + webhook handler (ack-and-defer, routing, error handling, tests)

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 01-04-PLAN.md — PM2 ecosystem config, setup.sh, README.md
- [ ] 01-05-PLAN.md — Mac mini deployment smoke test (checkpoint)

### Phase 2: Conversation Core
**Goal**: Ben can have a real multi-turn conversation with Claude via Telegram, with state that persists across sessions and resets on demand
**Depends on**: Phase 1
**Requirements**: CONV-01, CONV-02, CONV-03, CONV-04, LLM-01, LLM-02
**Success Criteria** (what must be TRUE):
  1. Ben sends three messages in sequence and Claude maintains context across all three (multi-turn works)
  2. Ben closes Telegram, reopens it 20 minutes later, and the conversation continues from where it left off (SQLite 24h TTL)
  3. Ben types `/reset` and the next message starts a fresh conversation with no prior context
  4. Ben types `/status` and sees today's token count plus a running total
  5. A real LLM call never blocks the Telegram webhook response — `/health` stays responsive during processing
**Plans**: TBD

### Phase 3: Model Router Expansion
**Goal**: Ben can switch between Claude, OpenAI GPT, and local Ollama models explicitly, with the chosen model persisting for the conversation
**Depends on**: Phase 2
**Requirements**: LLM-03, LLM-04, LLM-05, LLM-06, LLM-07
**Success Criteria** (what must be TRUE):
  1. Ben types `/model gpt-4o` and subsequent messages are answered by OpenAI, not Claude
  2. Ben types `/model local` and a response comes from Ollama on UNRAID (local inference confirmed)
  3. Model choice survives a `/reset` only when explicitly changed — it persists until Ben switches again
  4. `/status` shows cumulative cost/token breakdown across all providers used today
**Plans**: TBD

### Phase 4: Obsidian Integration
**Goal**: Ben can read, write, search, and quick-capture to his Obsidian vault from Telegram, with zero risk of sync corruption
**Depends on**: Phase 2
**Requirements**: OBS-01, OBS-02, OBS-03, OBS-04, OBS-05
**Success Criteria** (what must be TRUE):
  1. "log this: had an idea about X" appends to today's daily note and confirms the note title and location in reply
  2. "what did I learn this week?" reads recent vault files and returns a readable summary
  3. Ben can ask Claude to read a specific vault file by name and receive its contents
  4. A write during an active Obsidian Sync cycle does not corrupt the file (atomic rename pattern)
  5. Ben can ask Claude to sort recent inbox captures into the correct vault folders
**Plans**: TBD

### Phase 5: MCP Client Pool + Google Calendar
**Goal**: All MCP servers are connected at startup with health-checked persistent connections; Ben can ask about his calendar and check availability
**Depends on**: Phase 2
**Requirements**: SVC-01, SVC-02, SVC-03, SVC-07
**Success Criteria** (what must be TRUE):
  1. "what's on my calendar today?" returns today's events from Google Calendar without re-authenticating on each call
  2. Ben types `/accounts` and sees his connected Google accounts; he can add or remove an account from Telegram
  3. MCP connections survive hours of idle time without degrading (health-check + auto-reconnect verified by inspection)
  4. A Google OAuth token refresh happens silently — Ben never sees an auth error during normal use
**Plans**: TBD
**UI hint**: yes

### Phase 6: Skills Registry
**Goal**: Reusable workflows are discovered from markdown files, matched to Ben's messages, and executed by composing MCP tools; Ben can also teach new skills via chat
**Depends on**: Phase 4, Phase 5
**Requirements**: SKILL-01, SKILL-02, SKILL-03, SKILL-04, SKILL-05
**Success Criteria** (what must be TRUE):
  1. A skill defined in `skills/morning-capture.md` triggers automatically when Ben says "log this" without any code change
  2. Ben says "remember: when I say 'standup', summarize today's calendar and open tasks" and that skill persists as a file and fires on next use
  3. Ben types `/skills` and sees a list of active skills; he can view or delete one from Telegram
  4. A skill that calls Obsidian and Google Calendar in sequence completes and returns a coherent result (multi-tool composition)
**Plans**: TBD

### Phase 7: Cron Scheduler + Proactive Briefs
**Goal**: Ben receives a morning brief and evening digest on schedule without prompting; both are also available on demand
**Depends on**: Phase 5, Phase 6
**Requirements**: CRON-01, CRON-02, CRON-03
**Success Criteria** (what must be TRUE):
  1. At the configured morning time (SGT), Ben receives an unprompted message with today's calendar events and his Obsidian daily note
  2. At the configured evening time (SGT), Ben receives a summary of the day's captures and activity
  3. Ben types `/brief` at any time and receives the morning brief immediately, regardless of schedule
  4. Two scheduled jobs never run concurrently (noOverlap enforced) — verified by inspecting logs
**Plans**: TBD

### Phase 8: Webhook Ingress
**Goal**: External services can push events to the agent via HTTP, and GitHub PR/issue events arrive in Telegram as readable, Claude-summarized messages
**Depends on**: Phase 2
**Requirements**: HOOK-01, HOOK-02, HOOK-03, HOOK-04
**Success Criteria** (what must be TRUE):
  1. A GitHub webhook fires on a PR open and Ben receives a Telegram message with the PR title, author, and a one-line Claude summary
  2. A request to `/hook/github` with an incorrect secret key is rejected; a correct key delivers the payload
  3. An arbitrary JSON payload sent to `/hook/custom` arrives in Telegram as a readable Claude-formatted message
  4. A push event, issue comment, and CI failure each produce distinct, human-readable Telegram notifications
**Plans**: TBD

### Phase 9: Gmail Integration
**Goal**: Ben can read and search Gmail across multiple accounts from Telegram, and draft replies with an approval gate before any email is sent
**Depends on**: Phase 5
**Requirements**: SVC-04, SVC-05, SVC-06
**Success Criteria** (what must be TRUE):
  1. "show me unread emails from today" returns a readable summary of today's inbox across all connected Google accounts
  2. "search for emails about project X" returns matching email threads with sender, date, and subject
  3. Ben asks Claude to draft a reply; Claude sends the draft text to Telegram for approval before any email is transmitted
  4. Ben can query GitHub PRs, issues, and CI status from Telegram (GitHub integration connected via MCP)
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

Note: Phase 3 (Model Router Expansion) and Phase 4 (Obsidian) both depend only on Phase 2 and can be sequenced in either order. Phase 8 (Webhook Ingress) depends only on Phase 2 and can be inserted earlier if webhook notifications become urgent.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Infrastructure Foundation | 3/5 | Executing | - |
| 2. Conversation Core | 0/TBD | Not started | - |
| 3. Model Router Expansion | 0/TBD | Not started | - |
| 4. Obsidian Integration | 0/TBD | Not started | - |
| 5. MCP Client Pool + Google Calendar | 0/TBD | Not started | - |
| 6. Skills Registry | 0/TBD | Not started | - |
| 7. Cron Scheduler + Proactive Briefs | 0/TBD | Not started | - |
| 8. Webhook Ingress | 0/TBD | Not started | - |
| 9. Gmail Integration | 0/TBD | Not started | - |
