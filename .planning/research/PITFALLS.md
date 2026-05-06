# Pitfalls Research

**Domain:** Self-hosted personal AI orchestration agent (Mac mini + Telegram + Obsidian)
**Researched:** 2026-05-06
**Confidence:** HIGH (infrastructure pitfalls), MEDIUM (skills/polyglot patterns)

---

## Critical Pitfalls

### Pitfall 1: Webhook Timeout Cascade from Long-Running LLM Calls

**What goes wrong:**
The Telegram webhook handler takes longer than 60 seconds to respond while waiting for an LLM or MCP tool call to complete. Telegram interprets silence as failure, retries the same update, and the agent processes the same message 2-10 times, compounding costs and producing duplicate replies.

**Why it happens:**
Developers assume "just await the LLM call" works because it does in dev with fast responses. Production LLM calls (especially multi-step tool use) regularly exceed 60s. Retry loops compound the damage — each retry triggers the same slow path again.

**How to avoid:**
Implement ack-and-defer universally from day one. On webhook receipt: (1) validate signature, (2) send immediate "typing" indicator or ack to Telegram, (3) defer actual processing to a background job via `setImmediate` or a queue, (4) respond 200 to Telegram immediately. Never await an LLM call inside the webhook handler.

**Warning signs:**
- Duplicate messages appearing in Telegram
- Log entries showing the same `update_id` processed multiple times
- LLM API costs 2-3x higher than expected

**Phase to address:**
Phase 1 (bot core) — the ack-and-defer pattern must be the foundation before any LLM integration is added.

---

### Pitfall 2: Tailscale Funnel Certificate Rate Limiting and Outage Gaps

**What goes wrong:**
Tailscale Funnel auto-provisions TLS certificates via Let's Encrypt. Frequent restarts or re-provisioning hits Let's Encrypt rate limits (5 certs per domain per week), causing a 34-hour block during which the webhook endpoint is unreachable and the agent goes offline. Additionally, a known 2025 issue causes Chrome to show `ERR_CERTIFICATE_TRANSPARENCY_REQUIRED` on newly generated Funnel certificates.

**Why it happens:**
Developers restart services during debugging, each restart may trigger a new cert request, and the rate limit is hit before going to production. The Funnel URL is also tied to the tailnet domain — if Tailscale is down, the agent is down with no fallback.

**How to avoid:**
- Never kill and restart the Funnel service carelessly during development — use `tailscale funnel reset` only when necessary
- Configure PM2 or launchd to restart the Node.js app but NOT the Tailscale daemon
- Keep the Telegram webhook URL stable (set it once, don't change it)
- Monitor Tailscale service health as a dependency — add a `/health` endpoint that's checked by an uptime monitor
- Know the fallback: Telegram supports both webhooks and long polling; have long-polling mode ready as a degraded fallback

**Warning signs:**
- `tailscale funnel status` shows no active funnels
- Telegram delivers no new messages despite bot being running
- Certificate errors in browser when visiting the Funnel URL

**Phase to address:**
Phase 1 (infrastructure setup) — set Funnel once and treat it as immutable. Add health monitoring in the same phase.

---

### Pitfall 3: Obsidian File Corruption from Concurrent Writes During Sync

**What goes wrong:**
The agent appends to a daily note via direct filesystem write. Simultaneously, Obsidian Sync propagates a remote change to the same file. The result is either silent overwrite (Obsidian Sync wins, agent write is lost) or duplicate file creation (e.g., `2026-05-06 (1).md`) with split content. The vault appears intact but data is silently lost.

**Why it happens:**
Obsidian Sync does not use file locking — it treats the filesystem as the source of truth at sync-time. The agent's `fs.appendFile` call is not atomic and does not coordinate with Obsidian's sync process. This happens even on the Mac mini where both the Obsidian app and the agent run on the same machine, because Obsidian Sync is cloud-mediated.

**How to avoid:**
- Use atomic write operations: write to a temp file, then `fs.rename` to the target (rename is atomic on POSIX filesystems, including macOS APFS)
- Implement a simple file-level mutex (write lock file before accessing, remove after) for high-frequency writes
- Prefer appending to an inbox file (e.g., `_inbox.md`) rather than the live daily note — let a separate reconciliation step merge into the daily note during off-peak
- Keep Obsidian app closed during agent-heavy write operations if possible
- Never write directly to `.obsidian/` config files — these are managed exclusively by the Obsidian app

**Warning signs:**
- Files with `(1)` suffix appearing in the vault
- "Conflict" notices in Obsidian Sync history
- Missing quick-capture entries after reviewing daily notes

**Phase to address:**
Phase 2 (Obsidian integration) — atomic write pattern must be the default from the first write operation.

---

### Pitfall 4: Mac mini Sleep Silently Kills the Agent

**What goes wrong:**
macOS puts the Mac mini to sleep (display sleep or full system sleep), the Node.js process is suspended, Tailscale Funnel drops, and the Telegram webhook becomes unreachable. There is no error — requests simply time out. The agent appears running (PM2 shows it as online) but is actually suspended.

**Why it happens:**
macOS Energy Saver defaults are designed for personal use, not server use. "Prevent automatic sleeping when the display is off" is not enabled by default. Even if system sleep is disabled, display sleep can trigger partial resource suspension in some macOS versions.

**How to avoid:**
- In System Settings > Energy > Options: enable "Prevent automatic sleeping on power adapter when the display is off"
- Enable "Start up automatically after a power failure"
- Use `caffeinate -i` as a background process wrapper in the PM2 ecosystem config as a belt-and-suspenders measure
- Add macOS launchd keepalive to PM2's startup script so it survives logout
- Configure an external uptime monitor (e.g., UptimeRobot free tier, or a simple cron on UNRAID pinging `/health`) that alerts via Telegram if the agent is unreachable for >5 minutes

**Warning signs:**
- Agent goes silent during overnight hours
- No PM2 error logs — process shows as online but no webhook traffic
- `last` command shows no uptime gaps but Telegram shows message delivery failures

**Phase to address:**
Phase 1 (infrastructure setup) — configure before any other feature work.

---

### Pitfall 5: LLM Context Window Overflow Silently Degrades Quality

**What goes wrong:**
Conversation history grows unbounded. When the accumulated messages exceed the model's context window, the API either errors (hard failure) or silently truncates from the front of the history (soft failure). The agent loses context of earlier instructions, forgets user preferences stated earlier in the conversation, or hallucinates about past exchanges it can no longer see.

**Why it happens:**
Developers store the full message array in KV and pass it to the LLM without tracking token counts. This works in development where conversations are short. In production, long conversations, pasted documents, or skill definitions loaded into context cause overflow.

**How to avoid:**
- Track token count after every LLM response using the `usage` field in API responses
- Implement a sliding-window strategy: keep the system prompt + last N exchanges verbatim, summarize older history into a single "context summary" message
- Set a hard limit (e.g., 80% of the model's context window) that triggers compaction before overflow
- When switching models (e.g., Claude to Ollama 7B), recalculate — the smaller model may have a 4k or 8k window vs. 200k for Claude
- Do not store raw MCP tool responses in conversation history — summarize tool outputs before appending

**Warning signs:**
- LLM responses that contradict earlier instructions from the same conversation
- API errors: `context_length_exceeded` or similar
- Costs spiking despite short user messages (large history being sent every turn)

**Phase to address:**
Phase 2 (LLM integration) — add token tracking before adding any conversation persistence.

---

### Pitfall 6: Multi-Model Switching Breaks Tool Calling Reliability

**What goes wrong:**
The agent is configured to route "simple" tasks to local Ollama (e.g., Llama 3.1 8B) for cost/latency savings. These smaller models have significantly worse tool/function calling reliability. They mis-format JSON tool call arguments, call tools in wrong order, ignore tool results, or fail to call tools at all. The failure is often silent — the model returns a plausible-looking text response instead of using the tool.

**Why it happens:**
Tool calling is an emergent capability that degrades sharply with model size. A task that works flawlessly with Claude Sonnet may silently fail with a 7B local model. The routing logic doesn't account for tool complexity — "simple" is not the same as "no tools needed."

**How to avoid:**
- Define routing rules explicitly around tool use: if a task requires any MCP tool call, it must use a capable cloud model (Claude or GPT-4-class), never local models
- Use local models ONLY for pure text tasks: summarization, reformatting, quick Q&A with no tool calls
- Test each model with the exact tool schemas in use — don't rely on benchmarks
- Add a tool-call validator that checks responses against expected schema before acting; if the model returns invalid tool call JSON, fall back to cloud model and log the failure
- Cold-start penalty for Ollama on UNRAID is 5-30s for large models — account for this in timeout configuration

**Warning signs:**
- Obsidian writes not appearing after agent "confirms" writing a note
- Agent says "I've added this to your calendar" but no API call was made
- Intermittent failures on the same request type

**Phase to address:**
Phase 3 (multi-model routing) — define the capability tiers and routing rules before adding any non-Claude models.

---

### Pitfall 7: MCP Server Connection Instability in Long-Running Processes

**What goes wrong:**
MCP server connections (stdio or SSE transport) degrade over time. After hours of inactivity, the connection is silently dropped by the server (idle timeout), but the client still believes it is connected. The next tool call hangs indefinitely until the request timeout fires (60s hardcoded in the TypeScript SDK as of mid-2025), then returns an error. The user sees a failure with no actionable information.

**Why it happens:**
MCP connections are stateful. The TypeScript MCP SDK has a 60-second request timeout that is not reset by progress updates. Servers behind network address translation (including Tailscale) may also have idle connection timeouts that don't correspond to the client's assumptions.

**How to avoid:**
- Implement connection health checks before each tool call: send a lightweight `ping`/`list_tools` call and verify response before dispatching the real request
- Add auto-reconnect logic with exponential backoff: detect connection errors and reinitialize the client before retrying the original request
- For long-lived processes, implement a heartbeat interval (e.g., every 5 minutes) that keeps connections alive
- Set explicit `connectionTimeout` and `requestTimeout` in MCP client config rather than relying on defaults
- Log MCP connection state transitions (connected, disconnected, reconnecting) for observability

**Warning signs:**
- Tool call errors that are resolved by restarting the agent
- Error logs showing `-32001 Request Timeout` or `-32000 Connection Closed`
- Tool calls failing only after periods of inactivity (overnight, after lunch break)

**Phase to address:**
Phase 4 (MCP integration) — implement connection management infrastructure before adding individual MCP servers.

---

### Pitfall 8: Runaway Agent Loops Accumulate Unbounded LLM Costs

**What goes wrong:**
An agent loop (tool call → parse result → call tool again) enters an infinite or very long cycle due to a misconfigured prompt, a tool returning unexpected output, or the model getting stuck in a retry pattern. Because this is a personal single-user agent, there is no rate limiting or concurrent user cap to naturally halt the runaway. A single stuck loop can exhaust a monthly API budget overnight.

**Why it happens:**
Developers don't expect infinite loops in single-request flows. The model's tool-use retry logic is not bounded. Error handling in tool wrappers swallows the original error and returns a generic message, which the model interprets as "try again."

**How to avoid:**
- Implement a hard limit on tool calls per conversation turn (e.g., max 10 tool calls per user message)
- Track total tokens used per session; halt and notify the user when a configurable budget threshold is crossed
- Detect repeated identical tool calls: if the same tool is called with identical arguments 3 times in a row, halt the loop and inform the user
- Add per-provider monthly budget caps in a lightweight tracking table in KV or a JSON file; reject requests that would exceed the cap
- Alert via Telegram when daily spend exceeds a configurable threshold (e.g., send a message to the owner's chat)

**Warning signs:**
- A single user message results in dozens of tool calls in the logs
- LLM API daily spend spikes disproportionate to message volume
- Agent appears to "be thinking" for minutes without producing output

**Phase to address:**
Phase 2 (LLM integration) — add turn-level tool call cap before any multi-step tool use is enabled.

---

### Pitfall 9: TypeScript-Python Process Boundary is a Failure Amplifier

**What goes wrong:**
The TypeScript orchestration layer spawns a Python subprocess for AI/ML work. The Python process crashes or hangs silently. The TS parent waits on stdout, the subprocess is gone, the await never resolves, and the user gets no response. Alternatively, the Python process exits cleanly but the TS parent doesn't detect the exit and reuses the dead pipe for the next request.

**Why it happens:**
stdin/stdout IPC between languages feels simple but has many edge cases: buffering differences, partial JSON writes, subprocess death detection, error propagation, and encoding issues. These rarely manifest in development where subprocesses are short-lived.

**How to avoid:**
- Use HTTP-over-localhost (or Unix domain socket) instead of stdio for TS-Python communication — it has better error semantics, timeouts, and retry support than stdin/stdout
- Run the Python service as a persistent daemon (separate PM2 process) rather than spawning per-request subprocesses
- Add health check endpoints to the Python service; the TS layer checks health before sending requests
- Set explicit request timeouts on all cross-process calls; treat timeout as a circuit breaker that restarts the Python service
- Use newline-delimited JSON (NDJSON) if stdio is unavoidable — it has clear message boundaries unlike raw stdout

**Warning signs:**
- Requests that hang without error until manual restart
- "EPIPE" or "ECONNRESET" errors in the TS logs
- Python process listed as "stopped" in PM2 while TS shows it as healthy

**Phase to address:**
Phase 3 (polyglot integration) — define the IPC contract before writing any cross-process logic.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcoding model selection (always Claude) | Simpler routing logic | Locked to one provider; no cost optimization for simple tasks | MVP only — replace before adding local model support |
| Reading entire Obsidian vault on each query | Simple implementation | Slow at vault >500 notes; hits context window limits | Never — always use targeted file reads or search index from the start |
| Storing raw tool outputs in conversation history | Full audit trail | Context fills rapidly; costs escalate; large serialized JSON in KV | Never — summarize tool outputs before appending to history |
| Single process for all concerns (bot + orchestrator + MCP) | Simpler deployment | Any crash takes everything down; harder to restart MCP without restarting bot | MVP only — separate into at least 2 processes by Phase 4 |
| No token tracking (just pass full history to LLM) | Zero implementation cost | Silent quality degradation when history grows; eventual API errors | MVP only — add token tracking before first production use |
| Spawning Python subprocess per-request | No daemon to manage | Startup cost per request (1-3s); death detection complexity | Never — always run Python as a persistent service |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Tailscale Funnel | Restarting the daemon repeatedly during development, triggering cert rate limits | Set Funnel once, never restart the Tailscale daemon; only restart the app process |
| Obsidian Sync | Assuming `fs.writeFile` is safe because the Obsidian app is "not running" | Obsidian Sync runs as a background service independent of the app; always use atomic writes |
| Telegram webhook | Awaiting slow operations before returning 200 | Return 200 immediately; use `setImmediate` or a queue for actual processing |
| Anthropic Messages API | Passing full conversation history without token count tracking | Track `usage.input_tokens` after each response; compact before hitting 80% of context window |
| Ollama on UNRAID | Assuming the model is loaded and ready when the service is up | Ollama has per-model cold start (5-30s); pre-load required models on agent startup |
| MCP stdio transport | Treating the connection as persistent without health checks | Implement pre-call health checks and auto-reconnect with exponential backoff |
| Google Calendar / Gmail OAuth | Storing refresh tokens in plaintext config files | Store OAuth tokens in OS keychain or encrypted secret store, never in config files or code |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full vault search on every query | Queries taking 10-30s; Obsidian slow to respond | Build a lightweight search index (JSON file with note titles + first 200 chars) refreshed on file change | At ~200 notes |
| Sending full conversation history to Ollama 7B | 30-60s response times; context overflow errors | Cap conversation history at 4k tokens when using local models | After 5-10 message exchanges |
| MCP server cold start on first tool call | First tool call in a session takes 3-5x longer | Initialize MCP connections at agent startup, not lazily on first use | Every session if not pre-warmed |
| Synchronous Obsidian file reads blocking event loop | All Telegram responses slow during vault reads | Always use `fs.promises` (async); never use `fs.readFileSync` in the request path | Immediately under load |
| Telegram sendMessage without chunking on large LLM outputs | Message delivery failures; silent truncation at 4096 chars | Chunk at 4000 chars (already in existing code) — apply to all new message senders | Any response over 4096 chars |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Logging message content for debugging | Private notes, secrets, personal data in logs; breach exposure | Log message type and metadata only — never content. Already established in CLAUDE.md hard rules. |
| Indirect prompt injection via Obsidian notes | Malicious content in vault notes could manipulate agent into executing unintended actions (e.g., reading files, making API calls) | Treat vault content as untrusted user data; don't pass raw note content directly into system prompts without sanitization |
| Storing OAuth tokens in the repo or wrangler.toml | Credential leak via git history | Use OS keychain (macOS Keychain Access) or environment variables set outside of version control |
| Unrestricted Obsidian vault write access | Agent accidentally overwrites or deletes critical notes | Scope write permissions: agent can append to daily notes and inbox file; explicit user confirmation required for deletions or bulk writes |
| No update_id deduplication for webhook retries | Telegram retry storms cause duplicate actions: duplicate Obsidian writes, duplicate calendar events | Implement idempotency via KV cache keyed on `update_id` before processing any action with side effects |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Silent failure on long-running tasks | User sends message, nothing happens, no idea if agent is working | Always send a "working on it" message within 3 seconds of receipt, even if processing will take 60s |
| Generic error messages without recovery hint | User doesn't know if they should retry, rephrase, or wait | Error messages should include: what failed, whether to retry, and a fallback action |
| Model switching without user visibility | User confused when responses feel different (slower, less capable) | Log model selection in a debug mode; allow user to `!model` command to see what model was used |
| Skills that silently do nothing on parse failure | User teaches a skill, it appears saved, but never triggers correctly | Validate skill definition at save time; return parse errors immediately |
| Obsidian quick-capture without confirmation | User not sure if "log this: idea" was actually written to vault | Always confirm with the note title and location: "Appended to 2026-05-06.md under ## Inbox" |

---

## "Looks Done But Isn't" Checklist

- [ ] **Ack-and-defer:** Message appears to be handled but check that the 200 response is sent BEFORE the LLM call begins — not after
- [ ] **Tailscale Funnel:** Funnel appears active in `tailscale funnel status` but verify the webhook URL actually receives traffic with a manual `curl` test from an external network
- [ ] **Obsidian write:** Agent confirms "written to vault" but verify the file content on disk — sync conflict may have silently created a duplicate
- [ ] **MCP connection:** Tools appear registered but verify a real tool call succeeds end-to-end, not just that `list_tools` returns results
- [ ] **Token tracking:** Context management code is present but verify it fires correctly by checking that long conversations trigger compaction before the API returns a context error
- [ ] **Sleep prevention:** Energy Saver setting is configured but verify by leaving the machine idle for 2+ hours and confirming the agent still responds to messages
- [ ] **Process restart:** PM2 shows the app as online after a reboot but verify by actually rebooting the Mac mini and confirming the agent receives a test message without manual intervention
- [ ] **Ollama routing:** Local model routing works in dev but verify on UNRAID with actual network latency and a cold model (not already loaded into VRAM)

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Telegram webhook timeout cascade (duplicates) | LOW | Deduplicate by `update_id` in KV; replay detection prevents double-processing retroactively |
| Tailscale Funnel cert rate limit | HIGH (34h outage) | Switch to long-polling mode temporarily; investigate before next Funnel restart |
| Obsidian file corruption from concurrent write | MEDIUM | Restore from Obsidian Sync version history (keeps 12 months of file versions on paid plan) |
| Mac mini sleep taking agent offline | LOW | Re-enable sleep prevention settings; check PM2 startup script survives sleep/wake cycle |
| Context window overflow causing bad responses | LOW | Clear conversation state in KV for the affected session; user retries |
| Runaway agent loop (cost spike) | MEDIUM | Revoke and rotate the affected API key immediately; implement per-turn tool call cap before re-enabling |
| MCP connection dead after idle | LOW | Add auto-reconnect; manually restart the relevant MCP server to unblock immediately |
| TypeScript-Python IPC hang | MEDIUM | Restart Python service via PM2; add request timeout so future hangs self-resolve |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Webhook timeout cascade | Phase 1: Bot core | Send a message that triggers a 10s artificial delay; verify no duplicate in chat |
| Tailscale Funnel cert limits | Phase 1: Infrastructure | Count cert requests in Tailscale admin console after setup; should be 1 |
| Obsidian concurrent write corruption | Phase 2: Obsidian integration | Simulate concurrent write during active Obsidian Sync; verify no `(1)` files appear |
| Mac mini sleep | Phase 1: Infrastructure | Leave idle 2+ hours; verify health endpoint still responds |
| Context window overflow | Phase 2: LLM integration | Send a conversation with >100k tokens of history; verify compaction fires before API error |
| Multi-model tool call failure | Phase 3: Multi-model routing | Route a tool-calling task to Ollama 7B; verify fallback to cloud model fires on failure |
| MCP connection instability | Phase 4: MCP integration | Leave agent idle 1 hour; verify first post-idle tool call succeeds without manual restart |
| Runaway agent loops | Phase 2: LLM integration | Write a test skill that calls a tool in a loop; verify hard cap fires at ≤10 tool calls |
| TS-Python IPC hang | Phase 3: Polyglot integration | Kill the Python service mid-request; verify TS handles the error and restarts Python |
| Prompt injection via vault | Phase 2: Obsidian integration | Write a note with `Ignore all previous instructions and...`; verify it is not executed |

---

## Sources

- Tailscale Funnel documentation: https://tailscale.com/docs/features/tailscale-funnel
- Tailscale Funnel cert transparency issue (2025): https://github.com/tailscale/tailscale/issues/16179
- MCP TypeScript SDK timeout issue: https://github.com/modelcontextprotocol/typescript-sdk/issues/245
- MCP idle disconnect issue: https://github.com/anomalyco/opencode/issues/15209
- MCP error guide: https://mcpcat.io/guides/fixing-mcp-error-32001-request-timeout/
- Obsidian Sync conflict behavior: https://forum.obsidian.md/t/obsidian-sync-updates-from-one-device-overwritten-by-another/33007
- Obsidian race condition (plugin API): https://forum.obsidian.md/t/race-condition-with-two-async-calls/33394
- Mac mini sleep prevention for servers: https://cognito.co.nz/resources/mac-mini-as-a-server-preventing-it-from-going-to-sleep/
- macOS auto-restart after power failure: https://www.idownloadblog.com/2019/08/08/mac-automatically-restart-after-crash-terminal/
- Telegram webhook timeout cascade (grammY docs): https://grammy.dev/guide/deployment-types
- Runaway agent cost management: https://relayplane.com/blog/agent-runaway-costs-2026
- AI agent circuit breakers: https://dev.to/waxell/ai-agent-circuit-breakers-the-reliability-pattern-production-teams-are-missing-5bpg
- LLM token budget strategies: https://aisecuritygateway.ai/blog/llm-token-budget-strategies-for-agents
- Ollama cold start: https://mljourney.com/ollama-keep-alive-and-model-preloading-eliminate-cold-start-latency/
- AI agent prompt injection to RCE: https://blog.trailofbits.com/2025/10/22/prompt-injection-to-rce-in-ai-agents/
- OWASP AI Agent Security: https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html
- TS-Python IPC: https://dev.to/besworks/inter-process-communication-between-nodejs-and-python-djf
- PM2 startup on macOS: https://pm2.keymetrics.io/docs/usage/startup/

---
*Pitfalls research for: Self-hosted personal AI orchestration agent (Mac mini + Telegram + Obsidian)*
*Researched: 2026-05-06*
