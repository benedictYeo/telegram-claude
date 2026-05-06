# Feature Research

**Domain:** Personal AI Orchestration Agent (single-user, Telegram-first)
**Researched:** 2026-05-06
**Confidence:** HIGH (core features), MEDIUM (differentiators), HIGH (anti-features)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features the agent must have to be usable at all. Missing these breaks the core loop.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Multi-turn conversation with context | Without history, every message starts from scratch — useless for any extended task | LOW | KV-backed rolling window, 20-turn cap, 24h TTL. `/reset` to clear. Already designed. |
| Ack-and-defer response pattern | Telegram times out at 60s; Claude calls routinely take 5-15s. Without defer, Telegram retries, causing duplicate responses | LOW | Return 200 immediately, `waitUntil` / background task for actual call. Phase 2 in existing plan. |
| Typing indicator while processing | Users expect visual feedback that something is happening — blank silence reads as broken | LOW | `sendChatAction: typing` before every AI call. |
| Message chunking for long responses | Telegram API hard-limits messages at 4096 chars. Exceeding it crashes the send | LOW | Chunk at 4000 chars. Already implemented in Phase 1. |
| Auth gate — single-user enforcement | A public URL bot gets hammered. Without strict user allowlist + webhook secret, it is open to anyone | LOW | Webhook secret header + user ID allowlist. Already implemented. |
| `/reset` command | Context window grows stale; users need a clean escape hatch. No reset = frustrating loops | LOW | Deletes KV key for chat ID. |
| Basic slash-command routing | Users expect `/commands` for structural operations (reset, help, model switch). Free-text only feels incomplete | LOW | Simple prefix matching before AI dispatch. |
| Error feedback (safe, generic) | Silent failures with no feedback feel like crashes. But real errors must never be echoed back (security). | LOW | Generic `something failed` message. Real error typed in logs only. |
| Health check endpoint | Required for any always-on service — confirms deployment is live | LOW | Already implemented. |

---

### Differentiators (Competitive Advantage)

Features that make this agent more than a Claude wrapper. Ordered by value-to-effort ratio.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Obsidian vault integration (capture + retrieve) | The second brain becomes interactive. "Log this idea", "what did I learn this week?" — high daily utility for knowledge workers | MEDIUM | Direct filesystem access on Mac mini. No Obsidian API exists — read/write `.md` files directly. Quick capture appends to daily note; search summarizes recent notes via Claude. |
| Scheduled briefs (morning + evening) | Proactive agent behaviour — delivers value without being asked. 7 AM briefing combining calendar, weather, and Obsidian daily log is the most-adopted personal agent feature reported across Hermes and OpenClaw communities | MEDIUM | Cron triggers (Workers) or node-cron (Mac mini Node server). Two jobs: morning brief and evening digest. |
| MCP server connections (extensible tools) | Gives the agent hands: it can act on the world, not just respond. Each MCP server is a new capability without new code | MEDIUM | Anthropic SDK natively supports `mcp_servers[]`. Start with Notion + GitHub + Google. MCP ecosystem is actively growing. |
| Google Calendar integration | "What's on today?" is the #1 daily query for any personal assistant. Calendar read is table stakes for briefing quality | MEDIUM | OAuth 2.0 flow + token refresh. Read events, check availability. |
| Gmail integration (read + search + draft) | Email is the primary async inbox. Search + draft-to-approval is high value; sending directly is high risk | HIGH | OAuth shared with Calendar. Start with read/search only; draft→confirm before send. |
| GitHub integration (PRs + issues + CI) | Dev workflow notifications in the same channel as everything else. Reduces context switching | MEDIUM | GitHub MCP server or webhooks. PR status, issue mentions, CI pass/fail. |
| Skills system — file-based (markdown workflow definitions) | Reusable, version-controlled procedures that the agent follows. Hermes popularized this: a skill is a YAML-fronted `.md` file that becomes a reusable named workflow | HIGH | Skills live in a `skills/` directory. Agent discovers by name. Follows Hermes/agentskills.io format for portability. Composable: one skill can invoke another. |
| Skills system — teachable via chat ("when I say X, do Y") | Natural language shortcut registration in-conversation. Lower friction than editing files. Pairs with file-based skills as the authoring interface | MEDIUM | "Remember: when I say 'EOD', run the evening digest skill" → writes/updates skill file. Needs a skills persistence layer (Phase N+1). |
| Webhook ingress from external services | Turns the agent into a push-notification hub. GitHub, monitoring tools, IFTTT, or any HTTP-capable service can pipe events into Telegram | LOW | `/hook/:source?key=SECRET` endpoint. Per-source formatters. Optionally route through Claude for summarisation before pushing. |
| Model switching per task | Private/simple queries → local Ollama (cheap, private). Complex reasoning → Claude 3.5/4 Sonnet (quality). Most personal agent users see 30-50% cost reduction with routing | HIGH | Requires local model infra (UNRAID + Ollama already available). Routing logic: task classification → model selection. Start simple: `/model local` and `/model cloud` commands, then add auto-routing. |
| Per-source webhook intelligence | Raw JSON dumps are noise. Summarising via Claude before sending (e.g. "PR #42 merged: 3 files, adds OAuth flow") is far more useful | LOW | Wrap each webhook handler with a Claude summarisation call. Small prompt, fast, cheap. |

---

### Anti-Features (Deliberately NOT Building)

Features that seem valuable but create more problems than they solve for this use case.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Voice input/output | Hands-free interaction, more natural for some use cases | Adds transcription infra (Whisper), storage pipeline, and R2/S3. High complexity for v1. Telegram voice notes require downloading + transcribing before any processing. | Text-first for v1. Voice is a clean Phase 4+ addition once core is stable. |
| File/image generation (send back to Telegram) | Users want image generation, PDF reports, etc. | Telegram requires multipart form uploads, file size limits, and content type handling. Adds significant complexity to send path. | Return as inline HTML text or direct links to generated content. |
| Multi-user / family access | Sharing the agent | Completely changes security model — per-user session isolation, billing attribution, ALLOWED_USER list becomes ALLOWED_USERS with scoped permissions. Disproportionate complexity. | Keep single-user. A second user = a separate deployment. |
| Web dashboard | Visual management interface | Adds a frontend, auth layer, and new attack surface. Telegram IS the interface — duplicating it in a web UI adds overhead without adding value for a single user. | Telegram commands as the management interface (`/skills list`, `/model status`, `/webhook add`). |
| Real-time streaming responses | Responses stream in as they generate (ChatGPT-style) | Telegram's `editMessage` API has rate limits (1 edit/sec per chat). Streaming requires repeated edits causing 429s and flickering UX. High implementation complexity for marginal UX gain in async chat. | Single send when complete. Use typing indicator for perceived responsiveness. |
| Persistent long-term memory beyond Obsidian | Dedicated vector DB (Pinecone, Chroma) for long-term recall | Obsidian vault IS the memory. Adding a separate vector store duplicates the knowledge base and introduces sync drift. Over-engineering for v1. | Use Obsidian as the canonical second brain. Retrieval via search skill + Claude summarisation. |
| Approval gates for every action | Confirm before any write/send | Adds a round-trip to every destructive action, killing workflow fluency for trusted ops. Good idea for high-risk actions only (send email, delete file). | Selective approval: only for email send, file delete, PR merge. Read + capture operations require no approval. |
| Automatic skill creation from every conversation | Agent writes skills from all interactions (Hermes-style full self-improvement) | Generates noise skills that conflict with intentional ones. Without curation, skill library becomes unusable. Quality degrades as quantity grows. | Manual + explicit: agent creates skills only on explicit user command ("save this as a skill called X") or when a pre-tagged workflow is invoked 3+ times. |

---

## Feature Dependencies

```
Auth gate (webhook secret + user allowlist)
    └──required by──> All other features

Multi-turn conversation (KV context)
    └──required by──> Skills system (skills need conversation history to trigger)
    └──required by──> Model switching (routing decisions use conversation context)

MCP server connections
    └──required by──> Google Calendar integration (via Google MCP)
    └──required by──> Gmail integration (via Google MCP)
    └──required by──> GitHub integration (via GitHub MCP or webhooks)
    └──required by──> Obsidian vault integration (filesystem MCP or direct FS access)

Google OAuth flow
    └──required by──> Google Calendar integration
    └──required by──> Gmail integration

Scheduled briefs
    └──enhanced by──> Google Calendar integration (brief pulls today's events)
    └──enhanced by──> Obsidian vault (brief includes yesterday's captures)
    └──enhanced by──> Gmail integration (brief includes pending emails)

Skills system (file-based)
    └──required by──> Skills system (teachable/chat-based) — chat creates file-based skills
    └──enhanced by──> All MCP integrations (skills orchestrate MCP tools)

Webhook ingress endpoint
    └──enhanced by──> Per-source webhook intelligence (Claude summarisation layer)

Model switching
    └──required by──> Local model infra (Ollama on UNRAID, already available)
    └──conflicts with──> Single-model system prompt (prompt may be tuned to one model's behaviour)
```

### Dependency Notes

- **Auth gate required by everything:** No auth = public bot. Must be first.
- **MCP connections gated on Anthropic SDK MCP support:** Verify `anthropic-beta: mcp-client-2025-04-04` header requirement at build time. This is a beta API.
- **Google Calendar and Gmail share OAuth:** Build both in the same phase. One OAuth flow, two MCP servers.
- **Skills system (teachable) requires file-based skills:** The chat interface writes to the same skill file format. Cannot build the chat layer without the file layer.
- **Model switching conflicts with prompt tuning:** System prompts tuned to Claude's behaviour may perform differently on local models (Llama, Mistral). Keep system prompt model-agnostic.

---

## MVP Definition

### Launch With (v1)

Minimum set to make the agent genuinely useful every day.

- [ ] Auth gate (webhook secret + user ID) — security prerequisite for everything
- [ ] Multi-turn conversation with 24h TTL and `/reset` — without history, the agent is stateless and frustrating
- [ ] Ack-and-defer response pattern — required for Telegram's 60s timeout constraint
- [ ] Typing indicator — without feedback, users think it's broken
- [ ] Obsidian vault: quick capture + daily note append — highest daily utility, unique to this setup
- [ ] Obsidian vault: search + summarise — "what did I learn this week?" closes the second brain loop
- [ ] Scheduled morning brief (calendar + Obsidian) — proactive value delivery, the feature most users cite as making the agent "feel alive"
- [ ] Webhook ingress (GitHub + generic JSON) — routes important async events into the same channel

### Add After Validation (v1.x)

Add once core loop is stable and daily usage patterns are established.

- [ ] Google Calendar integration — adds to morning brief quality; requires OAuth setup
- [ ] Gmail read + search — highest-friction email workflow, read-only is safe
- [ ] File-based skills system — capture reusable workflows once patterns emerge from v1 usage
- [ ] Per-source webhook intelligence (Claude summarisation) — upgrade webhook noise into signal

### Future Consideration (v2+)

Defer until v1 patterns are clear and complexity is justified.

- [ ] Teachable skills via chat — build file-based skills first, teach-via-chat is an authoring shortcut
- [ ] Model switching (auto-routing) — start with explicit `/model` commands before building routing logic
- [ ] Gmail draft + send (with approval gate) — read-only first; sending requires trust in prompt reliability
- [ ] GitHub integration deeper than webhooks — PRs/issues via MCP adds value but GitHub webhooks cover 80% of the use case at lower complexity

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Auth gate | HIGH | LOW | P1 |
| Multi-turn conversation | HIGH | LOW | P1 |
| Ack-and-defer | HIGH | LOW | P1 |
| Typing indicator | MEDIUM | LOW | P1 |
| Obsidian quick capture | HIGH | MEDIUM | P1 |
| Obsidian search + summarise | HIGH | MEDIUM | P1 |
| Scheduled morning brief | HIGH | MEDIUM | P1 |
| Webhook ingress | MEDIUM | LOW | P1 |
| Google Calendar | HIGH | MEDIUM | P2 |
| Gmail read | MEDIUM | HIGH | P2 |
| File-based skills | HIGH | HIGH | P2 |
| Per-source webhook intelligence | MEDIUM | LOW | P2 |
| Teachable skills via chat | HIGH | HIGH | P3 |
| Model switching (explicit) | MEDIUM | MEDIUM | P2 |
| Model switching (auto-routing) | MEDIUM | HIGH | P3 |
| GitHub MCP integration | MEDIUM | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch — without these, agent is not useful daily
- P2: Should have — add once core is validated
- P3: Nice to have — defer until patterns from P1/P2 are clear

---

## Competitor Feature Analysis

| Feature | OpenClaw | Hermes Agent | This Project |
|---------|----------|--------------|--------------|
| Multi-channel support | 20+ channels (WhatsApp, Telegram, Discord, etc.) | 15+ platforms | Telegram only — single-channel is a feature, not a limitation. One interface, zero fragmentation. |
| Skills system | 100+ preconfigured AgentSkills, shell/FS/web automation | Markdown YAML-fronted skills files, self-improving, agentskills.io standard | File-based skills (Hermes format), explicit creation only (no auto-write noise) |
| Scheduled tasks | Cron job UI, any task on a timer | Natural language cron, daily briefing bot pattern | Hardcoded cron expressions for morning brief + evening digest. Expand to configurable cron in v2. |
| Second brain / Obsidian | Obsidian listed as supported integration | Not a primary focus | First-class: direct filesystem access on Mac mini. Obsidian IS the memory layer. |
| Model flexibility | Multi-model, local model support | Multi-provider | Multi-model from Phase 1 design. Local (Ollama/UNRAID) in v2. |
| Webhook ingress | No prominent webhook ingress feature | Not documented | First-class `/hook/:source` endpoint from early phase. |
| Self-improving / auto-skill creation | Not prominent | Core differentiator — agent writes its own skills | Explicitly an anti-feature. Manual skill creation only — quality over noise. |
| Voice input | Full voice support (ElevenLabs, system TTS) | Not documented | Deferred to v2+. Text-first. |
| Multi-agent routing | Full multi-agent with delegate_tool | Yes — isolated subagents | Out of scope v1. Single agent model. |

---

## Sources

- [OpenClaw — Personal AI Assistant](https://openclaw.ai/) — features overview, skills system, multi-channel support
- [OpenClaw GitHub](https://github.com/openclaw/openclaw) — implementation patterns
- [Hermes Agent Documentation](https://hermes-agent.nousresearch.com/docs/) — skills system, architecture
- [Hermes Skills System](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills) — markdown skill format, self-improving loop
- [Hermes Daily Briefing Bot Tutorial](https://hermes-agent.nousresearch.com/docs/guides/daily-briefing-bot) — morning briefing pattern
- [OpenClaw Cron Jobs Guide](https://openclawai.io/blog/openclaw-cron-jobs-scheduling-guide/) — scheduling patterns for personal agents
- [7-Model Local AI Portfolio: Task Routing](https://www.mindstudio.ai/blog/7-model-local-ai-portfolio-routing-local-cloud) — model switching strategy, 30-50% cost reduction data
- [AI Agent Anti-Patterns Part 1](https://achan2013.medium.com/ai-agent-anti-patterns-part-1-architectural-pitfalls-that-break-enterprise-agents-before-they-32d211dded43) — anti-pattern reference
- [Obsidian Second Brain + AI Agents](https://www.myyearindata.com/posts/obsidian-second-brain-ai-agents/) — Obsidian integration patterns
- [Webhook Integration for AI Agents](https://callsphere.ai/blog/webhook-integration-ai-agents-event-driven) — event-driven ingress design
- [Telegram Threads + OpenClaw Memory](https://www.mindstudio.ai/blog/telegram-threads-openclaw-agent-memory) — conversation context management

---

*Feature research for: Personal AI Orchestration Agent (Telegram + Obsidian + MCP)*
*Researched: 2026-05-06*
