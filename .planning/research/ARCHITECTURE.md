# Architecture Research

**Domain:** Personal AI Orchestration Agent — self-hosted Mac mini, polyglot TS + Python
**Researched:** 2026-05-06
**Confidence:** HIGH (core patterns verified against MCP SDK docs, Tailscale docs, community production use)

---

## Standard Architecture

### System Overview

```
  INTERNET
      │
      │  HTTPS (ports 443 / 8443 / 10000 only)
      ▼
┌─────────────────────┐
│   Tailscale Funnel  │  ← public HTTPS termination, no port forwarding
│   (Tailscale relay) │    cert managed by Tailscale
└──────────┬──────────┘
           │ proxied to localhost
           ▼
┌──────────────────────────────────────────────────────────┐
│                   Mac mini (always-on)                    │
│                                                           │
│  ┌──────────────────────────────────────────────────┐    │
│  │            TS CORE SERVER  (Hono / Node.js)       │    │
│  │                                                    │    │
│  │  POST /webhook  ──→ TelegramHandler               │    │
│  │  POST /hook/:src ──→ WebhookIngressHandler        │    │
│  │  GET  /health   ──→ HealthHandler                 │    │
│  │                                                    │    │
│  │  CronScheduler (node-cron)                        │    │
│  │    morning-brief task                             │    │
│  │    evening-digest task                            │    │
│  │                                                    │    │
│  │  Orchestrator Core                                │    │
│  │    ├── ModelRouter      (Claude / OpenAI / Ollama)│    │
│  │    ├── ConversationStore (SQLite, 24h TTL)        │    │
│  │    ├── SkillsRegistry   (file-based + teachable)  │    │
│  │    └── MCPClientPool    (multiple MCP servers)    │    │
│  └──────────┬─────────────────────────────┬──────────┘    │
│             │ stdio / HTTP                │ fs read/write  │
│             ▼                             ▼               │
│  ┌──────────────────────┐   ┌─────────────────────────┐  │
│  │  Python Bridge       │   │  Obsidian Vault          │  │
│  │  (subprocess / IPC)  │   │  (~/Documents/Vault/)    │  │
│  │  local model helpers │   │  daily notes, journals   │  │
│  │  AI/ML transforms    │   │  skills definitions      │  │
│  └──────────────────────┘   └─────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
           │                              │
           │  HTTPS/stdio                 │  HTTP
           ▼                             ▼
┌────────────────────┐        ┌─────────────────────────┐
│  MCP Servers       │        │  UNRAID (LAN)            │
│  (remote/local)    │        │  Ollama :11434           │
│  - Google MCP      │        │  OpenAI-compatible API   │
│  - GitHub MCP      │        │  local models            │
│  - Telegram MCP    │        └─────────────────────────┘
│  - custom          │
└────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| Tailscale Funnel | Public HTTPS ingress, cert management, relay | Core Server via localhost proxy |
| TS Core Server (Hono) | Request routing, auth gate, ack-and-defer, cron | All internal components |
| TelegramHandler | Webhook verify, user check, message dispatch | Orchestrator Core, Telegram Bot API |
| WebhookIngressHandler | External alert intake, key verify, format + push | Telegram Bot API, Orchestrator Core |
| CronScheduler | Timed task dispatch (morning brief, evening digest) | Orchestrator Core |
| Orchestrator Core | Coord between model, memory, skills, MCP | ModelRouter, ConversationStore, SkillsRegistry, MCPClientPool |
| ModelRouter | Picks model per task, unified provider interface | Claude API, OpenAI API, Ollama (UNRAID) |
| ConversationStore | Persist multi-turn history, enforce TTL | SQLite on Mac mini |
| SkillsRegistry | Load/match skills from files + KV-stored teachable skills | Filesystem (Vault skills dir), SQLite |
| MCPClientPool | Maintain MCP server connections (stdio or HTTP), tool routing | External MCP servers via stdio/HTTPS |
| Python Bridge | AI/ML operations not available in TS ecosystem | Spawned subprocess, stdin/stdout JSON |
| Obsidian Vault | Second brain — read/write daily notes, search vault | Core Server via Node.js `fs` module |

---

## Recommended Project Structure

```
src/
├── server.ts               # Entry: Hono app, Tailscale Funnel config, cron init
├── handlers/
│   ├── telegram.ts         # POST /webhook — auth gate, ack-defer, message dispatch
│   ├── webhook-ingress.ts  # POST /hook/:source — external alerts
│   ├── health.ts           # GET /health
│   └── oauth.ts            # GET /oauth/* — Google OAuth flow
├── core/
│   ├── auth.ts             # Telegram signature verify, user ID check
│   ├── telegram.ts         # sendMessage, sendChatAction, chunking, HTML mode
│   ├── orchestrator.ts     # Top-level: receive message → skill match → model call → reply
│   ├── model-router.ts     # Unified LLM interface: Claude / OpenAI / Ollama dispatch
│   └── mcp-client-pool.ts  # MCP server lifecycle, tool invocation
├── skills/
│   ├── registry.ts         # Discover + load skill definitions, match to messages
│   ├── executor.ts         # Run skill steps, compose MCP calls
│   └── definitions/        # Bundled skill .md files (git-tracked)
├── obsidian/
│   ├── reader.ts           # Read notes, search vault, extract daily note
│   └── writer.ts           # Append to daily note, create notes
├── state/
│   ├── conversation.ts     # SQLite read/write, TTL enforcement, trim to N turns
│   └── oauth.ts            # Google OAuth token storage + refresh
├── cron/
│   ├── scheduler.ts        # node-cron setup, SGT timezone config
│   ├── morning-brief.ts    # Pulls calendar + Obsidian + weather, sends via Telegram
│   └── evening-digest.ts   # Summarises day's notes + events
├── python-bridge/
│   ├── bridge.ts           # Spawn Python subprocess, JSON-over-stdin/stdout IPC
│   └── types.ts            # Shared request/response types for Python calls
└── types.ts                # Global type definitions

python/
├── bridge.py               # Entry: reads JSON from stdin, dispatches to handlers
├── handlers/
│   ├── embeddings.py       # Local embedding generation
│   └── transforms.py       # AI/ML transforms not available in TS
└── requirements.txt

skills/                     # User-editable vault skills dir (outside src/)
└── *.md                    # SKILL.md format — discovered at runtime

data/
└── agent.db                # SQLite: conversation history, teachable skills, OAuth tokens
```

### Structure Rationale

- **handlers/**: Thin entry points. Auth happens here, nothing else. No business logic.
- **core/**: Shared utilities consumed by multiple handlers. No state.
- **skills/**: Decoupled from core so user can add/edit skills without code change.
- **obsidian/**: Isolated FS access. Vault path configured via env var — no hardcoding.
- **state/**: All persistence in one place. SQLite preferred over JSON files (atomic writes, TTL queries, FTS5 for skill search).
- **python-bridge/**: Explicit boundary. If Python isn't needed for a task, it never spawns.
- **cron/**: Separate from handlers to keep routing and scheduling concerns distinct.

---

## Architectural Patterns

### Pattern 1: Ack-and-Defer (CRITICAL)

**What:** HTTP handler returns 200 immediately. All LLM/MCP work runs in background Promise. Result pushed to Telegram via `sendMessage`.

**When to use:** Every Telegram message handler. Always. No exceptions.

**Trade-offs:** Slightly more complex error handling; user gets typing indicator not a synchronous reply. Telegram will retry on non-200 — deferring prevents duplicate processing.

**Example:**
```typescript
// handlers/telegram.ts
app.post('/webhook', async (c) => {
  const authFail = checkSignature(c.req, c.env);
  if (authFail) return authFail;

  const update = await c.req.json();
  if (!checkUser(update, c.env)) return c.json({ ok: true }); // silent drop

  // Ack immediately — never await the work here
  c.executionCtx.waitUntil(
    handleMessage(update, c.env).catch((err) => {
      logError('handler', err.constructor.name);
    })
  );

  return c.json({ ok: true });
});
```

### Pattern 2: Unified Model Router

**What:** Single `callModel(params)` function that dispatches to Claude, OpenAI, or Ollama based on a task-type-to-model mapping. Callers never import provider SDKs directly.

**When to use:** Every LLM call goes through the router. Model selection logic lives in one file.

**Trade-offs:** Adds one indirection layer. Worth it — avoids provider-specific branching scattered through codebase and enables easy model swaps.

**Example:**
```typescript
// core/model-router.ts
type TaskType = 'chat' | 'summarise' | 'classify' | 'embed';

const MODEL_MAP: Record<TaskType, ModelConfig> = {
  chat:      { provider: 'anthropic', model: 'claude-opus-4' },
  summarise: { provider: 'anthropic', model: 'claude-haiku-4-5' },
  classify:  { provider: 'ollama',    model: 'llama3.2:3b', baseUrl: process.env.OLLAMA_URL },
  embed:     { provider: 'ollama',    model: 'nomic-embed-text', baseUrl: process.env.OLLAMA_URL },
};

export async function callModel(task: TaskType, messages: Message[], tools?: Tool[]) {
  const config = MODEL_MAP[task];
  switch (config.provider) {
    case 'anthropic': return callClaude(config, messages, tools);
    case 'openai':    return callOpenAI(config, messages, tools);
    case 'ollama':    return callOllama(config, messages, tools);
  }
}
```

### Pattern 3: MCP Client Pool (Persistent Connections)

**What:** MCP servers are spawned once at startup and kept alive. A pool object manages connections, exposes a `callTool(serverName, toolName, args)` interface.

**When to use:** All MCP tool invocations.

**Trade-offs:** Requires graceful shutdown handling. Much more efficient than spawning per-request. Stdio transport for local/co-located MCP servers; HTTP transport for remote.

**Example:**
```typescript
// core/mcp-client-pool.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export class MCPClientPool {
  private clients = new Map<string, Client>();

  async init(configs: MCPServerConfig[]) {
    for (const cfg of configs) {
      const transport = new StdioClientTransport({ command: cfg.command, args: cfg.args });
      const client = new Client({ name: 'agent', version: '1.0.0' });
      await client.connect(transport);
      this.clients.set(cfg.name, client);
    }
  }

  async callTool(server: string, tool: string, args: unknown) {
    return this.clients.get(server)?.callTool({ name: tool, arguments: args });
  }
}
```

### Pattern 4: Skill Discovery via SKILL.md Files

**What:** Skills live as Markdown files in a `skills/` directory. Registry scans at startup (and on-demand reload). Each file has YAML frontmatter with triggers and description. Agent loads full skill body only when a message matches.

**When to use:** For any teachable or repeatable workflow.

**Trade-offs:** File-based = requires filesystem access (fine on Mac mini). Not as dynamic as DB-only, but more editable and git-friendly.

**Example structure:**
```
---
name: morning-capture
triggers: ["log this", "note:", "remember that"]
description: "Appends a quick thought to today's daily note in Obsidian"
---

## Steps
1. Extract the content after the trigger phrase
2. Read today's daily note path (YYYY-MM-DD.md in Vault/Daily/)
3. Append "- HH:MM: {content}" to the note
4. Confirm to user: "Logged."
```

### Pattern 5: Python Bridge via stdin/stdout JSON

**What:** Python subprocess spawned on demand (or kept warm). Node.js sends JSON request on stdin, reads JSON response from stdout. Stderr for Python logs only (never interferes with JSON channel).

**When to use:** AI/ML tasks not available in TS — e.g. local embedding generation, vector similarity, specialized NLP. NOT for Telegram handling or MCP calls.

**Trade-offs:** Cold start ~500ms if not pre-warmed. Keep subprocess alive if embeddings are frequent.

**Example:**
```typescript
// python-bridge/bridge.ts
import { spawn, ChildProcess } from 'child_process';

let proc: ChildProcess | null = null;

function getProc(): ChildProcess {
  if (!proc || proc.killed) {
    proc = spawn('python3', ['./python/bridge.py'], { stdio: ['pipe', 'pipe', 'inherit'] });
  }
  return proc;
}

export async function callPython<T>(method: string, params: unknown): Promise<T> {
  const child = getProc();
  const request = JSON.stringify({ method, params }) + '\n';
  child.stdin!.write(request);
  return new Promise((resolve, reject) => {
    child.stdout!.once('data', (data) => {
      try { resolve(JSON.parse(data.toString())); }
      catch (e) { reject(e); }
    });
  });
}
```

---

## Data Flow

### Inbound Chat Message

```
Telegram → POST /webhook
    │
    ├── checkSignature() → 401 if invalid
    ├── checkUser() → silent 200 if not allowed
    └── ack 200 immediately
         │
         └── [background] handleMessage()
                │
                ├── ConversationStore.load(chatId)  ← SQLite
                ├── SkillsRegistry.match(message)
                │     ├── match found → skill executor path
                │     └── no match → direct LLM path
                │
                ├── [skill path] SkillExecutor.run(skill, context)
                │     └── MCPClientPool.callTool(...)  ← MCP server
                │
                ├── [LLM path] ModelRouter.callModel('chat', history, tools)
                │     └── provider SDK call (Claude / Ollama)
                │
                ├── ConversationStore.save(chatId, updatedHistory)
                └── tgSend(chatId, response)         → Telegram Bot API
```

### Cron Task (Morning Brief)

```
node-cron fires at schedule
    │
    └── CronTask.run(env)
          ├── MCPClientPool.callTool('google-calendar', 'list-events', today)
          ├── ObsidianReader.getDailyNote(today)
          ├── ModelRouter.callModel('summarise', briefPrompt)
          └── tgSend(OWNER_CHAT_ID, briefText)
```

### External Webhook Ingress

```
External service → POST /hook/:source?key=SECRET
    │
    ├── checkWebhookKey() → 401 if invalid
    └── WebhookIngressHandler.dispatch(source, payload)
          ├── [optional] ModelRouter.callModel('summarise', rawPayload)
          └── tgSend(OWNER_CHAT_ID, formattedAlert)
```

### Quick Capture (Obsidian Write)

```
User: "log this: idea about distributed state"
    │
    └── SkillsRegistry.match() → "morning-capture" skill
          │
          ├── ObsidianReader.getDailyNotePath(today)  ← fs.stat()
          ├── ObsidianWriter.append(path, "- 14:32: idea about distributed state")  ← fs.appendFile()
          └── tgSend("Logged.")
```

### State Management

```
SQLite agent.db
├── conversations table
│   └── key: chat_id | value: JSON message array | expires_at: epoch
├── skills table (teachable)
│   └── trigger phrase → skill definition text
└── oauth table
    └── provider | user_id → refresh_token | access_token | expires_at
```

---

## Component Boundaries

| Boundary | Communication Method | Direction | Notes |
|----------|---------------------|-----------|-------|
| Tailscale Funnel → Core Server | TCP localhost proxy (port 3000) | inbound | Funnel terminates TLS; Core Server sees plain HTTP |
| Core Server → Telegram Bot API | HTTPS fetch | outbound | Raw fetch, no library |
| Core Server → Claude API | HTTPS (Anthropic SDK) | outbound | SDK handles retries |
| Core Server → OpenAI API | HTTPS (fetch or SDK) | outbound | Optional, if routing to OpenAI |
| Core Server → Ollama (UNRAID) | HTTP LAN (port 11434) | outbound | OpenAI-compatible /v1/ endpoint |
| Core Server → MCP Servers | stdio JSON-RPC (local) or HTTPS (remote) | bidirectional | Pool managed at startup |
| Core Server → Python Bridge | stdin/stdout newline-delimited JSON | bidirectional | Subprocess, kept warm if needed |
| Core Server → Obsidian Vault | Node.js `fs` module | read/write | Direct filesystem, no API |
| Core Server → SQLite | better-sqlite3 (sync) | read/write | Single-writer, WAL mode |

---

## Build Order (Phase Dependencies)

```
Phase A: Core Server + Auth + Telegram ack-defer
    │
    │  Dependency: nothing — this is the foundation
    │
Phase B: Conversation State (SQLite)
    │
    │  Dependency: Phase A (need a working handler to test turns)
    │
Phase C: Model Router + Claude integration
    │
    │  Dependency: Phase B (conversation history needed for quality LLM calls)
    │
Phase D: MCP Client Pool + first MCP server (Google Calendar or GitHub)
    │
    │  Dependency: Phase C (LLM needed to interpret MCP tool results)
    │
Phase E: Obsidian read/write + Quick Capture skill
    │
    │  Dependency: Phase D (skills system needs MCP pool architecture in place)
    │
Phase F: Skills Registry (file-based + teachable via chat)
    │
    │  Dependency: Phase E (Obsidian integration validates skill execution)
    │
Phase G: Cron Scheduler (morning brief, evening digest)
    │
    │  Dependency: Phase D (needs MCP for calendar), Phase E (needs Obsidian)
    │
Phase H: Webhook Ingress (/hook/:source)
    │
    │  Dependency: Phase C (summarisation path through LLM)
    │
Phase I: Additional LLM Providers (OpenAI, Ollama)
    │
    │  Dependency: Phase C (extend existing ModelRouter)
    │
Phase J: Python Bridge (local embeddings, ML transforms)
    │
    │  Dependency: Phase F (skills system is the primary consumer)
```

**Critical path:** A → B → C → D → E → F

**Parallelisable after Phase D:** G and H can proceed independently.

**Phase I and J are extensions** — the system is useful without them.

---

## Scaling Considerations

This is a single-user, always-on agent. Scale concerns are reliability and latency, not throughput.

| Concern | Single-user Mac mini | Notes |
|---------|---------------------|-------|
| Concurrent requests | Not a concern — one user | Ack-and-defer handles the only concurrency scenario (Telegram retries) |
| SQLite contention | None — single writer | WAL mode still recommended; eliminates read/write conflicts |
| MCP server crashes | Process dies silently | Pool needs reconnect logic on next call; startup-time spawn is not enough |
| Python subprocess OOM | Memory spike on large embeddings | Keep-warm subprocess vs on-demand: use on-demand initially |
| Tailscale Funnel uptime | Funnel depends on Tailscale daemon | Add launchd plist to ensure Tailscale starts on boot |
| Node.js process crash | Bot goes silent | Use PM2 or launchd for process supervision |

---

## Anti-Patterns

### Anti-Pattern 1: Direct Telegram Webhook Calls Without Ack-and-Defer

**What people do:** `await llmCall()` inside the webhook handler before returning 200.

**Why it's wrong:** Telegram retries after 60s. If LLM takes >60s, you get duplicate processing. Telegram expects 200 within seconds.

**Do this instead:** Return 200 immediately, do all async work in a detached Promise (`waitUntil` equivalent in Node.js = `setImmediate` + process `unhandledRejection` handler, or structured via a job queue).

### Anti-Pattern 2: console.log() in stdio MCP Servers

**What people do:** Use `console.log()` for debug output in an MCP server using stdio transport.

**Why it's wrong:** stdout is the JSON-RPC channel. Any non-JSON output corrupts the protocol stream silently.

**Do this instead:** All MCP server logging goes to `console.error()` (stderr). Never stdout.

### Anti-Pattern 3: Provider SDK Calls Scattered Through Codebase

**What people do:** Import Anthropic SDK directly in conversation.ts, in morning-brief.ts, in skill executor, etc.

**Why it's wrong:** Switching models or providers becomes a multi-file refactor. Model selection logic is implicit.

**Do this instead:** All LLM calls go through `ModelRouter.callModel(task, messages)`. Task type drives model selection. Swap providers in one place.

### Anti-Pattern 4: Hardcoded Obsidian Vault Path

**What people do:** `const vaultPath = '/Users/ben/Documents/ObsidianVault'` in source.

**Why it's wrong:** Breaks on reinstall, different user, or if vault is moved. Vault path is config, not code.

**Do this instead:** `process.env.OBSIDIAN_VAULT_PATH` with a validation check at startup. Fail fast if missing.

### Anti-Pattern 5: MCP Server Spawned Per-Request

**What people do:** Create a new `StdioClientTransport` and `Client` for each incoming message.

**Why it's wrong:** MCP server startup overhead (100–500ms), connection limits, resource leaks. Each spawn creates a new subprocess.

**Do this instead:** Pool initialized at server startup. Connections reused. Reconnect logic for crashed servers.

### Anti-Pattern 6: MarkdownV2 Parse Mode

**What people do:** Use `parse_mode: 'MarkdownV2'` for Telegram messages.

**Why it's wrong:** Requires escaping `_*[]()~\`>#+-=|{}.!`. Missing any escape character silently drops the message or sends malformed output.

**Do this instead:** Always `parse_mode: 'HTML'`. Use `<b>`, `<i>`, `<code>` tags. No escape edge cases.

---

## Integration Points

### External Services

| Service | Integration Pattern | Transport | Auth |
|---------|---------------------|-----------|------|
| Telegram Bot API | Raw fetch to `api.telegram.org` | HTTPS | Bot token in header |
| Anthropic Claude | SDK (`@anthropic-ai/sdk`) | HTTPS | API key env var |
| Google Calendar/Gmail | MCP server (Google MCP) | stdio or HTTPS | OAuth2 refresh token in SQLite |
| GitHub | MCP server (GitHub MCP) | stdio | PAT env var |
| Ollama (UNRAID) | Raw fetch to `http://UNRAID_IP:11434/v1/` | HTTP LAN | None (LAN-only) |
| Obsidian Vault | Node.js `fs` module | Filesystem | None (local) |

### Internal Boundaries

| Boundary | Communication | Contract |
|----------|---------------|----------|
| Handler → Orchestrator | Direct function call (same process) | `Message` type, returns `void` |
| Orchestrator → ModelRouter | Direct function call | `callModel(task, messages, tools?)` → `ModelResponse` |
| Orchestrator → MCPClientPool | Direct method call | `callTool(server, tool, args)` → `ToolResult` |
| Orchestrator → SkillsRegistry | Direct method call | `match(text)` → `Skill \| null` |
| Orchestrator → ConversationStore | Direct method call | `load(chatId)`, `save(chatId, history)` |
| Core Server → Python Bridge | subprocess JSON | `{ method, params }` → `{ result } \| { error }` |
| Skills Executor → Obsidian | ObsidianReader/Writer | `getDailyNote(date)`, `append(path, text)` |

---

## Sources

- MCP TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- MCP StdioClientTransport multi-server guide: https://medium.com/@shivamchamoli1997/step-by-step-guide-build-multi-server-mcp-system-with-stdioclienttransport-9ecb7f555bb7
- Tailscale Funnel examples: https://tailscale.com/kb/1247/funnel-examples
- Tailscale Funnel for webhooks (Twilio guide): https://www.twilio.com/en-us/blog/developers/tutorials/develop-webhooks-locally-using-tailscale-funnel
- SKILL.md open standard: https://agentskills.io/what-are-skills
- SKILL.md pattern article: https://bibek-poudel.medium.com/the-skill-md-pattern-how-to-write-ai-agent-skills-that-actually-work-72a3169dd7ee
- Ollama REST API reference: https://mljourney.com/ollama-rest-api-reference-every-endpoint-with-examples/
- Node.js / Python IPC via stdin/stdout: https://dev.to/besworks/inter-process-communication-between-nodejs-and-python-djf
- node-cron scheduling: https://github.com/node-cron/node-cron
- Hono vs Fastify vs Express comparison: https://betterstack.com/community/guides/scaling-nodejs/fastify-vs-express-vs-hono/
- Mac mini as AI agent host: https://thenewstack.io/ai-layoffs-mcp-api-mac-mini-agent/
- Agent state with SQLite: https://gerus-lab.hashnode.dev/why-your-ai-agents-memory-is-broken-and-how-to-fix-it-with-sqlite
- OpenClaw Tailscale docs: https://docs.openclaw.ai/gateway/tailscale

---

*Architecture research for: Personal AI Orchestration Agent (Mac mini, TS + Python, Telegram)*
*Researched: 2026-05-06*
