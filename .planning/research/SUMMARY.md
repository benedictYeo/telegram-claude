# Project Research Summary

**Project:** Personal AI Orchestration Agent (Mac mini + Telegram + Obsidian)
**Domain:** Self-hosted single-user AI agent — Node.js on Mac mini, Telegram interface, MCP tools, Obsidian vault
**Researched:** 2026-05-06
**Confidence:** HIGH

## Executive Summary

This is a self-hosted personal AI orchestration agent migrating from Cloudflare Workers (V8 isolate) to a persistent Node.js process on a Mac mini exposed via Tailscale Funnel. The migration unlocks filesystem access (Obsidian vault), persistent SQLite state, local model inference via Ollama on UNRAID, and in-process scheduling via node-cron — capabilities impossible in a serverless runtime. The recommended approach is Hono + `@hono/node-server` (identical web-standards API to the existing CF Workers handlers, zero-rewrite migration), `@anthropic-ai/sdk` for the primary LLM, `@modelcontextprotocol/sdk` for local stdio MCP servers, and PM2 for process supervision with launchd integration. Existing TypeScript and Vitest infrastructure transfers cleanly; only the runtime adapter changes.

The architecture is an event-driven orchestration core: a thin Hono HTTP layer handles Telegram webhooks and webhook ingress, immediately acks and defers all LLM work to background Promises, then pushes responses via Telegram Bot API. All LLM calls route through a unified `ModelRouter` abstraction. MCP servers (filesystem, Google, GitHub, custom skills) are pooled at startup and reused. Obsidian vault is the canonical memory layer — read/written directly via Node.js `fs.promises` with atomic rename patterns to avoid sync conflicts. SQLite replaces Workers KV for conversation history, OAuth tokens, and teachable skill storage.

The critical risk profile centers on three failure modes that must be addressed before feature work: Telegram webhook timeout cascades (ack-and-defer is non-negotiable from day one), Mac mini sleep silently killing the process (Energy Saver config + PM2 + caffeinate), and Tailscale Funnel certificate rate limiting (set once, never restart the Tailscale daemon). Secondary risks include LLM context window overflow degrading conversation quality silently, runaway agent tool loops accumulating unbounded API costs, and MCP connection staleness after idle periods. Each has a clear prevention strategy documented in PITFALLS.md.

---

## Key Findings

### Recommended Stack

The stack is purpose-built for the Mac mini Node.js runtime. Hono is the clear HTTP framework choice — its web-standards `app.fetch` interface is identical to CF Workers handlers, so existing route logic migrates without rewriting. `@hono/node-server` is the thin Node.js adapter. Node.js 22 LTS eliminates `dotenv` via built-in `--env-file` flag. PM2 wraps launchd for process supervision and log rotation with a single `pm2 startup` command.

For LLM providers, `@anthropic-ai/sdk` 0.93.x is primary. `openai` 6.x and `ollama` 0.6.x are available for routing to GPT or local UNRAID models respectively. All provider calls are abstracted behind a single `callModel(task, messages, tools?)` function — callers never import provider SDKs directly. MCP connectivity uses `@modelcontextprotocol/sdk` 1.29.x: stdio transport for local servers (filesystem, vault, custom skills), StreamableHTTP for remote hosted servers (Google, GitHub, Notion).

**Core technologies:**
- **Node.js 22 LTS**: Runtime — full filesystem access, native ESM, built-in `--env-file`
- **TypeScript 5.8+ (strict)**: Language — already in use, no migration cost
- **Hono 4.12.x + `@hono/node-server` 2.0.x**: HTTP server — web-standards API, zero handler rewrite from CF Workers
- **`@anthropic-ai/sdk` 0.93.x**: Primary LLM client — tool use, streaming, MCP connector beta
- **`@modelcontextprotocol/sdk` 1.29.x**: MCP client + server — stdio (local) and StreamableHTTP (remote)
- **`better-sqlite3`**: State persistence — conversation history, OAuth tokens, teachable skills
- **`node-cron` 4.2.x**: In-process scheduler — morning brief, evening digest, `noOverlap: true`
- **PM2 7.0.x**: Process supervisor — launchd integration, auto-restart on crash, log rotation

**Version requirements:**
- `node-cron` must be v4+ for `noOverlap` option — do not use v3
- `@modelcontextprotocol/sdk` imports require `.js` extensions — use `"moduleResolution": "bundler"` or `"node16"` in tsconfig
- Anthropic MCP connector beta requires `anthropic-beta: mcp-client-2025-04-04` header — verify current header name at build time

### Expected Features

**Must have (table stakes) — v1 launch blockers:**
- Auth gate (webhook secret + user ID allowlist) — security prerequisite for everything else
- Multi-turn conversation with 24h TTL and `/reset` — stateless agent is not useful
- Ack-and-defer response pattern — Telegram 60s timeout makes this non-negotiable
- Typing indicator during processing — blank silence reads as broken
- Message chunking at 4000 chars — Telegram hard-limits at 4096, exceeding crashes send
- Health check endpoint — required for uptime monitoring
- Obsidian quick capture (append to daily note) — highest daily utility, unique to this setup
- Obsidian search + summarise — closes the second brain loop
- Scheduled morning brief (calendar + Obsidian) — proactive delivery; the feature most cited as making an agent "feel alive"
- Webhook ingress (`/hook/:source`) — routes GitHub and external events into the same channel

**Should have (differentiators) — v1.x after core validation:**
- Google Calendar integration — adds daily brief quality; requires OAuth
- Gmail read + search (read-only) — high-friction inbox workflow, read-only is safe
- File-based skills system — reusable version-controlled workflows in SKILL.md format
- Per-source webhook intelligence (Claude summarisation) — upgrades raw JSON noise into signal

**Defer (v2+):**
- Teachable skills via chat — requires file-based skills layer first
- Model switching (auto-routing) — start with explicit `/model` commands
- Gmail draft + send — read-only first; sending requires high confidence in prompt reliability
- GitHub MCP (deeper than webhooks) — webhooks cover 80% of the use case at lower complexity
- Voice input/output — adds Whisper pipeline, high complexity for v1
- Streaming responses — Telegram `editMessage` rate limits make this a poor UX tradeoff

**Explicit anti-features:**
- Multi-user access — changes security model disproportionately; second user = separate deployment
- Web dashboard — Telegram IS the interface; duplicating it adds overhead without value
- Auto-generated skills from every conversation — generates noise; manual/explicit creation only
- Persistent vector DB (Pinecone, Chroma) — Obsidian vault is the memory; separate vector store creates sync drift

### Architecture Approach

The system is a single always-on Node.js process on the Mac mini, structured as a thin HTTP routing layer over a central orchestration core. Handlers are entry points only — auth happens there, nothing else. The orchestrator coordinates between ModelRouter (LLM dispatch), ConversationStore (SQLite history), SkillsRegistry (file-based SKILL.md discovery), and MCPClientPool (persistent connections to MCP servers). Obsidian vault is accessed directly via `fs.promises`. A Python bridge (subprocess or HTTP-over-localhost) is available for ML tasks not available in TypeScript, but is only spawned when actually needed.

**Major components:**
1. **Hono HTTP server** — Routes `/webhook`, `/hook/:source`, `/health`, `/oauth/*`; acks 200 immediately on Telegram webhook
2. **Orchestrator Core** — Coordinates model, memory, skills, and MCP for each request
3. **ModelRouter** — Unified `callModel(task, messages, tools?)` dispatching to Claude / OpenAI / Ollama; callers never import provider SDKs
4. **ConversationStore** — SQLite-backed rolling 20-turn window with 24h TTL and token tracking
5. **MCPClientPool** — Persistent pooled connections to all MCP servers; spawned at startup, health-checked before each call
6. **SkillsRegistry** — Scans `skills/*.md` at startup; YAML frontmatter triggers matched against incoming messages
7. **CronScheduler** — `node-cron` jobs in SGT timezone; morning brief + evening digest
8. **ObsidianReader/Writer** — `fs.promises` access to vault; atomic rename pattern on all writes

**Critical path build order:** Core Server → ConversationStore → ModelRouter → MCPClientPool → Obsidian → SkillsRegistry → Cron → Webhook Ingress

### Critical Pitfalls

1. **Webhook timeout cascade** — Never await an LLM call inside the webhook handler. Return 200 immediately; process in background Promise. Telegram retries after 60s, causing duplicate processing and 2-10x API cost amplification. Must be in place from Phase 1 before any LLM integration.

2. **Mac mini sleep kills the agent silently** — Enable "Prevent automatic sleeping on power adapter when display is off" in Energy Saver. Add `caffeinate -i` to PM2 ecosystem config. Add external uptime monitor pinging `/health`. PM2 will show the process as online even when the machine is suspended.

3. **Tailscale Funnel certificate rate limiting** — Let's Encrypt limits to 5 certs per domain per week. Set Funnel once, never restart the Tailscale daemon during development — only restart the Node.js app. Have Telegram long-polling ready as a degraded fallback.

4. **Obsidian concurrent write corruption** — Obsidian Sync runs as a background service independent of the app. `fs.appendFile` is not atomic and does not coordinate with Sync. Use `fs.promises.writeFile` to a temp file then `fs.rename` (atomic on APFS). Default to appending to an `_inbox.md` inbox file rather than the live daily note.

5. **LLM context window overflow** — Full conversation history passed without token tracking causes silent quality degradation as history grows, eventually producing API errors. Track `usage.input_tokens` after every response. Compact history to a summarized form at 80% of context window. Do not store raw MCP tool outputs in conversation history — summarize before appending.

6. **Runaway agent tool loops** — Unbounded agentic loops can exhaust a monthly API budget overnight. Implement a hard cap of 10 tool calls per conversation turn. Detect repeated identical tool calls (same tool, same args, 3x in a row) as a circuit breaker. Track daily spend and alert via Telegram when threshold is crossed.

7. **MCP connection staleness after idle** — Stdio MCP connections degrade silently after hours of inactivity. Implement a lightweight pre-call health check (`list_tools`) and auto-reconnect with exponential backoff. Set explicit `connectionTimeout` and `requestTimeout` — do not rely on SDK defaults.

---

## Implications for Roadmap

Based on combined research, suggested phase structure follows the architecture build order with pitfall-prevention baked in at each phase boundary.

### Phase 1: Infrastructure Foundation

**Rationale:** Everything else depends on a working, always-on, authenticated HTTP server. Infrastructure pitfalls (sleep, Funnel certs, PM2) must be solved before any feature work — they are silent failure modes that corrupt later phases.

**Delivers:** Node.js + Hono server running on Mac mini under PM2, exposed via Tailscale Funnel, receiving Telegram webhooks with full auth gate (signature + user ID). Health endpoint. Uptime monitor configured.

**Addresses:** Auth gate (table stakes), health check (table stakes), ack-and-defer skeleton (webhook returns 200 immediately, deferred handler logs message)

**Avoids:** Mac mini sleep (Energy Saver + caffeinate), Tailscale cert rate limits (set once), webhook timeout cascade (ack-and-defer established as the pattern before LLM is added)

### Phase 2: Conversation Core + LLM Integration

**Rationale:** Multi-turn conversation and Claude integration are prerequisites for every subsequent feature. Token tracking must be added here — before any conversation grows long enough to hit context limits.

**Delivers:** SQLite ConversationStore (24h TTL, 20-turn window, token tracking), ModelRouter with Claude as sole provider, full message handling with typing indicator, `/reset` command, message chunking. Agent can hold a real conversation.

**Uses:** `@anthropic-ai/sdk` 0.93.x, `better-sqlite3`, Hono handler pattern

**Implements:** ConversationStore, ModelRouter (Claude only), TelegramHandler fully wired

**Avoids:** Context window overflow (token tracking + compaction built in), runaway loops (per-turn tool call cap established), raw tool output in history

### Phase 3: Obsidian Integration + Quick Capture

**Rationale:** Obsidian is the primary differentiator and highest-value v1 feature. Filesystem access is now available (Mac mini); atomic write patterns must be established before any sync conflicts occur.

**Delivers:** ObsidianReader (daily note lookup, vault search), ObsidianWriter (atomic append via temp file + rename), "log this" quick capture as a hardcoded skill, confirmation message with note title and location.

**Uses:** Node.js `fs.promises`, `OBSIDIAN_VAULT_PATH` env var (never hardcoded), atomic rename pattern

**Implements:** `obsidian/reader.ts`, `obsidian/writer.ts`, first skill (hardcoded, pre-registry)

**Avoids:** Concurrent write corruption (atomic rename from day one), hardcoded vault path, synchronous `readFileSync` in request path

### Phase 4: MCP Client Pool + Google Calendar

**Rationale:** MCPClientPool is the infrastructure for all external integrations. Building it once (with connection pooling, health checks, and reconnect logic) serves all subsequent MCP servers. Google Calendar is the first MCP server because it feeds directly into the morning brief.

**Delivers:** MCPClientPool with startup initialization, pre-call health checks, auto-reconnect with exponential backoff. Google Calendar MCP connected. Agent can answer "what's on today?"

**Uses:** `@modelcontextprotocol/sdk` 1.29.x, stdio transport for local, StreamableHTTP for Google MCP, OAuth 2.0 token storage in SQLite

**Implements:** `core/mcp-client-pool.ts`, `state/oauth.ts`, Google Calendar MCP server

**Avoids:** MCP connection staleness (health checks + reconnect), per-request MCP spawn (pool initialized at startup)

### Phase 5: Skills Registry + File-Based Skills

**Rationale:** Skills system formalizes reusable workflows. Once Obsidian integration is validated and MCP tools are available, file-based skills can orchestrate both. SKILL.md format (agentskills.io standard) enables portability and git-tracking.

**Delivers:** SkillsRegistry that scans `skills/*.md` at startup, matches trigger phrases, executes skill steps via MCP tool calls. Morning capture skill, vault search skill. Hot-reload on file change.

**Uses:** SKILL.md YAML frontmatter format, SkillsRegistry, SkillExecutor

**Implements:** `skills/registry.ts`, `skills/executor.ts`, `skills/definitions/` bundled skills

### Phase 6: Cron Scheduler + Morning Brief

**Rationale:** Scheduled briefs are the most-cited "makes the agent feel alive" feature. Depends on Phase 4 (Google Calendar via MCP) and Phase 3 (Obsidian) being stable.

**Delivers:** `node-cron` scheduler in SGT timezone, morning brief (calendar + Obsidian daily note + weather), evening digest (day's captures summarized). Proactive value delivery without user prompting.

**Uses:** `node-cron` 4.2.x with `noOverlap: true`, existing ModelRouter (summarise task type → Claude Haiku), ObsidianReader, MCPClientPool (Google Calendar)

**Implements:** `cron/scheduler.ts`, `cron/morning-brief.ts`, `cron/evening-digest.ts`

### Phase 7: Webhook Ingress

**Rationale:** Webhook ingress is relatively self-contained (low dependency) and high value for GitHub CI/PR notifications. Depends only on the LLM summarisation path (Phase 2).

**Delivers:** `/hook/:source?key=SECRET` endpoint, per-source key verification, Claude summarisation layer (raw JSON → readable message), GitHub webhook formatter, generic JSON fallback.

**Uses:** Existing ModelRouter (summarise task), Hono route, per-source WEBHOOK_KEY env vars

**Implements:** `handlers/webhook-ingress.ts`

### Phase 8: Additional LLM Providers + Model Routing

**Rationale:** OpenAI and Ollama extend the ModelRouter that already exists. Deferred to Phase 8 so routing rules are informed by real usage patterns from Phases 2-7. Local models are for pure-text tasks only — never tool-calling tasks.

**Delivers:** OpenAI and Ollama providers added to ModelRouter. Explicit `/model cloud` and `/model local` commands. Routing rule: any task requiring MCP tool calls uses cloud model; pure-text summarisation can use local.

**Uses:** `openai` 6.36.x, `ollama` 0.6.x, UNRAID Ollama at `http://UNRAID_IP:11434`

**Avoids:** Multi-model tool call failure (local models never route tool-calling tasks), Ollama cold start (pre-load models on agent startup)

### Phase 9: Gmail Integration + Advanced Skills

**Rationale:** Gmail requires OAuth (shared with Calendar), read-only first, and is the highest-complexity integration. Teachable skills via chat requires file-based skills (Phase 5) as the underlying persistence layer.

**Delivers:** Gmail read + search via Google MCP. Teachable skills: "when I say X, do Y" writes a new SKILL.md file and reloads registry. Draft-with-approval gate for email send (not auto-send).

**Uses:** Google MCP (shared OAuth from Phase 4), SkillsRegistry hot-reload, explicit confirmation pattern for destructive actions

### Phase Ordering Rationale

- **Infrastructure first (Phase 1):** Silent failure modes (sleep, Funnel certs) corrupt all phases if not solved upfront. Ack-and-defer must be established before LLM is added.
- **Conversation before tools (Phase 2 before 4):** The LLM needs conversation context to interpret MCP tool results usefully.
- **Obsidian before skills (Phase 3 before 5):** Skills execute Obsidian writes; the atomic write pattern must be established first.
- **MCP pool before individual servers (Phase 4):** The connection management infrastructure is built once and serves all subsequent MCP integrations.
- **Skills before cron (Phase 5 before 6):** Morning brief is better implemented as a skill than as hardcoded cron logic.
- **Webhook ingress independent (Phase 7):** Low dependency on earlier phases beyond LLM; can be shuffled to Phase 3-4 if webhook notifications are urgent.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 4 (MCP + Google Calendar):** Google MCP server setup, OAuth 2.0 refresh token flow in Node.js, current Anthropic MCP connector beta header name — these change between betas
- **Phase 6 (Cron/Morning Brief):** Weather API choice (no MCP server exists; needs direct API call) — requires API selection decision
- **Phase 9 (Gmail):** Gmail draft-to-approval UX pattern, Telegram inline keyboard for approval confirmation — needs implementation research

Phases with standard, well-documented patterns (skip research-phase):
- **Phase 1 (Infrastructure):** Hono, PM2, Tailscale Funnel, launchd all have excellent docs
- **Phase 2 (Conversation + Claude):** `@anthropic-ai/sdk` is extensively documented; SQLite patterns are standard
- **Phase 3 (Obsidian):** Filesystem access is basic Node.js; atomic write pattern is POSIX-standard
- **Phase 7 (Webhook Ingress):** Simple Hono route + fetch — no novel patterns

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified via Context7, npm registry, and official docs as of 2026-05-06 |
| Features | HIGH (core), MEDIUM (differentiators) | Core table stakes are well-established; differentiator priority based on community patterns (Hermes, OpenClaw), not direct user research |
| Architecture | HIGH | Patterns verified against MCP SDK docs, Tailscale docs, and production community reports |
| Pitfalls | HIGH (infrastructure), MEDIUM (skills/polyglot) | Infrastructure pitfalls have documented GitHub issues and official sources; polyglot IPC patterns are community-sourced |

**Overall confidence:** HIGH

### Gaps to Address

- **Google MCP server setup:** The Google MCP hosted endpoint requires OAuth 2.0 setup that varies by Google API product. Verify exact scopes and token refresh behavior at Phase 4 planning time. The `anthropic-beta` MCP connector header changes between betas — check current value in Anthropic docs at build time.
- **Weather data for morning brief:** No hosted MCP server for weather was identified in research. Options: Open-Meteo (free, no API key), OpenWeatherMap (free tier). Decision deferred to Phase 6.
- **Teachable skill conflict resolution:** When a new teachable skill trigger overlaps with an existing skill trigger, the conflict resolution strategy is unspecified. Define tie-breaking rules (last-write-wins vs. error) at Phase 9 planning time.
- **Python bridge necessity:** Research documents the Python bridge architecture but the only concrete Python use case is local embeddings. Assess at Phase 8 whether embeddings are actually needed before building the bridge at all. HTTP-over-localhost preferred over stdio if bridge is built.
- **update_id deduplication:** PITFALLS.md flags idempotency via `update_id` KV cache as a security/reliability requirement. Not explicitly phased. Should be added to Phase 2 alongside ack-and-defer hardening.

---

## Sources

### Primary (HIGH confidence)
- `/anthropics/anthropic-sdk-typescript` (Context7) — SDK version 0.93.x, tool runner, streaming, MCP connector beta
- `/modelcontextprotocol/typescript-sdk` (Context7) — stdio and StreamableHTTP transport, version 1.29.x
- `/websites/hono_dev` (Context7) — Node.js adapter setup, route patterns
- `/node-cron/node-cron` (Context7) — timezone support, `noOverlap` option
- https://tailscale.com/kb/1223/funnel — port constraints (443, 8443, 10000 only)
- https://pm2.keymetrics.io/docs/usage/startup/ — launchd integration
- npm registry (2026-05-06) — all package versions confirmed current
- https://github.com/modelcontextprotocol/typescript-sdk — MCP SDK timeout and connection issues
- https://github.com/tailscale/tailscale/issues/16179 — Funnel cert transparency issue 2025
- https://tailscale.com/docs/features/tailscale-funnel — cert rate limit behavior

### Secondary (MEDIUM confidence)
- Hermes Agent docs — skills system format (agentskills.io/SKILL.md standard)
- OpenClaw docs — multi-channel agent patterns, skills system comparison
- https://grammy.dev/guide/deployment-types — Telegram webhook timeout cascade behavior
- https://forum.obsidian.md/t/obsidian-sync-updates-from-one-device-overwritten-by-another/33007 — Obsidian Sync conflict behavior
- https://gerus-lab.hashnode.dev/why-your-ai-agents-memory-is-broken-and-how-to-fix-it-with-sqlite — SQLite for agent state
- https://relayplane.com/blog/agent-runaway-costs-2026 — runaway agent cost patterns

### Tertiary (LOW confidence — validate during implementation)
- https://mcpcat.io/guides/fixing-mcp-error-32001-request-timeout/ — MCP timeout resolution patterns
- https://mljourney.com/ollama-keep-alive-and-model-preloading-eliminate-cold-start-latency/ — Ollama cold start mitigation
- https://blog.trailofbits.com/2025/10/22/prompt-injection-to-rce-in-ai-agents/ — prompt injection via vault notes (theoretical risk, needs project-specific validation)

---

*Research completed: 2026-05-06*
*Ready for roadmap: yes*
