# Requirements: Telegram Claude Orchestrator

**Defined:** 2026-05-06
**Core Value:** Always-accessible AI assistant that can read/write my second brain and orchestrate services on my behalf — from anywhere, via Telegram.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Infrastructure

- [ ] **INFRA-01**: Server runs on Mac mini via Node.js, exposed via Tailscale Funnel
- [ ] **INFRA-02**: PM2 manages process lifecycle with auto-restart on crash and reboot
- [ ] **INFRA-03**: Mac mini sleep prevention configured (always available)
- [x] **INFRA-04**: Auth gate verifies Telegram webhook secret header on every request
- [x] **INFRA-05**: Auth gate silently drops messages from non-allowed user IDs
- [x] **INFRA-06**: Ack-and-defer pattern — respond 200 immediately, process async
- [x] **INFRA-07**: Typing indicator sent before every AI call
- [x] **INFRA-08**: Message chunking at 4000 chars (safety margin under 4096)
- [x] **INFRA-09**: Health check endpoint (no auth, no info disclosure)
- [x] **INFRA-10**: Slash-command routing (prefix match before AI dispatch)
- [x] **INFRA-11**: Generic error feedback to user, real error logged by type only

### Conversation

- [ ] **CONV-01**: Multi-turn conversation with rolling context window
- [ ] **CONV-02**: Conversation state persisted in SQLite with 24h TTL
- [ ] **CONV-03**: `/reset` command clears conversation history
- [ ] **CONV-04**: Token tracking per conversation (daily usage visible via `/status`)

### LLM

- [ ] **LLM-01**: Model router abstraction — handlers never call provider SDKs directly
- [ ] **LLM-02**: Claude support via Anthropic SDK
- [ ] **LLM-03**: OpenAI support via OpenAI SDK
- [ ] **LLM-04**: Ollama support for local models on UNRAID
- [ ] **LLM-05**: Explicit model switching via `/model` command
- [ ] **LLM-06**: Per-conversation model persistence (switching sticks until changed)
- [ ] **LLM-07**: Cost/token tracking across all providers

### Obsidian

- [ ] **OBS-01**: Read files from Obsidian vault via direct filesystem access
- [ ] **OBS-02**: Write/append to files in Obsidian vault (atomic write via temp+rename)
- [ ] **OBS-03**: Quick capture — "log this: X" appends to today's daily note
- [ ] **OBS-04**: Search vault and summarize results ("what did I learn this week?")
- [ ] **OBS-05**: Sort/organize captures into correct vault folders via agent skill

### Services

- [ ] **SVC-01**: MCP client pool with startup-time initialization and reconnect logic
- [ ] **SVC-02**: Google OAuth flow supporting multiple accounts (per-account token storage in SQLite)
- [ ] **SVC-03**: Google Calendar — read events, check availability across multiple accounts
- [ ] **SVC-04**: Gmail — read, search emails across multiple accounts
- [ ] **SVC-05**: Gmail — draft replies with approval gate before sending (account-aware)
- [ ] **SVC-06**: GitHub integration — PRs, issues, CI status, notifications
- [ ] **SVC-07**: `/accounts` command — list, add, remove Google accounts

### Skills

- [ ] **SKILL-01**: File-based skills — agent discovers .md files in skills directory
- [ ] **SKILL-02**: Skill trigger matching from conversation context
- [ ] **SKILL-03**: Skill executor — follows markdown instructions, composes MCP tools
- [ ] **SKILL-04**: Teachable skills via chat — "remember: when I say X, do Y" persists as skill file
- [ ] **SKILL-05**: `/skills` command — list, view, delete skills

### Proactive

- [ ] **CRON-01**: Scheduled morning brief (calendar + Obsidian daily log + weather)
- [ ] **CRON-02**: Scheduled evening digest (summarize day's activity)
- [ ] **CRON-03**: Manual trigger via `/brief` and `/digest` commands
- [ ] **HOOK-01**: Webhook ingress endpoint `/hook/:source` with secret key auth
- [ ] **HOOK-02**: GitHub webhook formatter (PR, issue, push events)
- [ ] **HOOK-03**: Generic JSON webhook handler
- [ ] **HOOK-04**: Claude summarization layer for webhook payloads

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Voice

- **VOICE-01**: Voice note input via Whisper transcription
- **VOICE-02**: Voice output via TTS

### Advanced

- **ADV-01**: Auto model routing (classify task complexity -> pick model automatically)
- **ADV-02**: Multi-conversation threads per chat (`/new`, `/switch`)
- **ADV-03**: File/image input from Telegram -> Claude vision
- **ADV-04**: Inline Telegram keyboards for quick actions
- **ADV-05**: Python bridge for ML-specific tasks (embeddings, local inference pipelines)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Multi-user / family access | Completely changes security model. Single user only. Second user = separate deployment. |
| Web dashboard | Telegram IS the interface. Duplicating in web UI adds overhead without value for single user. |
| Real-time streaming responses | Telegram `editMessage` rate limits (1/sec) cause 429s and flickering. Single send with typing indicator instead. |
| Persistent long-term memory beyond Obsidian | Obsidian vault IS the memory. Separate vector DB duplicates knowledge and introduces sync drift. |
| Automatic skill creation from conversations | Generates noise that degrades skill library. Manual/explicit creation only. |
| Mobile app | Telegram is the mobile interface. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 1 | Pending |
| INFRA-04 | Phase 1 | Complete |
| INFRA-05 | Phase 1 | Complete |
| INFRA-06 | Phase 1 | Complete |
| INFRA-07 | Phase 1 | Complete |
| INFRA-08 | Phase 1 | Complete |
| INFRA-09 | Phase 1 | Complete |
| INFRA-10 | Phase 1 | Complete |
| INFRA-11 | Phase 1 | Complete |
| CONV-01 | Phase 2 | Pending |
| CONV-02 | Phase 2 | Pending |
| CONV-03 | Phase 2 | Pending |
| CONV-04 | Phase 2 | Pending |
| LLM-01 | Phase 2 | Pending |
| LLM-02 | Phase 2 | Pending |
| LLM-03 | Phase 3 | Pending |
| LLM-04 | Phase 3 | Pending |
| LLM-05 | Phase 3 | Pending |
| LLM-06 | Phase 3 | Pending |
| LLM-07 | Phase 3 | Pending |
| OBS-01 | Phase 4 | Pending |
| OBS-02 | Phase 4 | Pending |
| OBS-03 | Phase 4 | Pending |
| OBS-04 | Phase 4 | Pending |
| OBS-05 | Phase 4 | Pending |
| SVC-01 | Phase 5 | Pending |
| SVC-02 | Phase 5 | Pending |
| SVC-03 | Phase 5 | Pending |
| SVC-07 | Phase 5 | Pending |
| SKILL-01 | Phase 6 | Pending |
| SKILL-02 | Phase 6 | Pending |
| SKILL-03 | Phase 6 | Pending |
| SKILL-04 | Phase 6 | Pending |
| SKILL-05 | Phase 6 | Pending |
| CRON-01 | Phase 7 | Pending |
| CRON-02 | Phase 7 | Pending |
| CRON-03 | Phase 7 | Pending |
| HOOK-01 | Phase 8 | Pending |
| HOOK-02 | Phase 8 | Pending |
| HOOK-03 | Phase 8 | Pending |
| HOOK-04 | Phase 8 | Pending |
| SVC-04 | Phase 9 | Pending |
| SVC-05 | Phase 9 | Pending |
| SVC-06 | Phase 9 | Pending |

**Coverage:**
- v1 requirements: 40 total
- Mapped to phases: 40
- Unmapped: 0

---
*Requirements defined: 2026-05-06*
*Last updated: 2026-05-06 after roadmap creation — traceability complete*
