# Stack Research

**Domain:** Personal AI Orchestration Agent — Mac mini, Telegram interface, multi-model LLM, MCP tools, Obsidian vault
**Researched:** 2026-05-06
**Confidence:** HIGH (all recommendations verified via Context7, npm, or official docs)

---

## Context: What Changed from Phase 1

Phase 1 was a Cloudflare Workers (V8 isolate) deployment. The target runtime is now a **Node.js process on a Mac mini**, exposed via Tailscale Funnel. Key changes:

| Phase 1 (CF Workers) | Target (Mac mini Node.js) |
|---|---|
| V8 isolate, no Node.js APIs | Full Node.js 22+ runtime |
| `ctx.waitUntil` for async | Plain `async/await`, no execution limits |
| Workers KV for state | In-process Map + JSON file or SQLite |
| Wrangler secrets | dotenv or macOS Keychain / env vars |
| No filesystem access | Direct filesystem: Obsidian vault, skill files |
| Cron via `wrangler.toml` | `node-cron` in-process scheduler |
| CF Tunnels / workers.dev URL | Tailscale Funnel (HTTPS, no port forward) |

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Node.js** | 22 LTS | Runtime | Current LTS, native ESM, fast startup. Node 22 adds `--env-file` flag eliminating dotenv as a dependency. |
| **TypeScript** | 5.8+ (strict) | Language | Already in use. Strict mode enforced. Transfers cleanly from CF Workers — no runtime API changes needed for core logic. |
| **Hono** | 4.12.x | HTTP server | Web-standards API identical to CF Workers — `app.fetch` is the same interface. Zero-rewrite migration from existing handlers. Native TypeScript, 4x faster than Express, tree-shakeable. Use `@hono/node-server` adapter. |
| **@anthropic-ai/sdk** | 0.93.x | Claude API client | Official SDK. Handles streaming, tool use, retry, token counting. Required for `toolRunner` (agentic loops) and MCP connector beta. |
| **@modelcontextprotocol/sdk** | 1.29.x | MCP client + server | Official SDK. Needed to spawn local MCP servers (stdio transport) or connect to remote ones (StreamableHTTP transport). Used when Anthropic's MCP connector is unavailable or you want local tool control. |

### LLM Providers

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **@anthropic-ai/sdk** | 0.93.x | Claude (Sonnet, Haiku, Opus) | Default. Best tool use, best instruction following. Primary model. |
| **openai** | 6.36.x | OpenAI GPT models | Fallback or specific tasks. Same message format as Anthropic. Use `openai` npm package. |
| **ollama** | 0.6.x | Local models via Ollama on UNRAID | Private tasks, cost-zero inference, offline fallback. Ollama JS lib wraps the local Ollama REST API. OpenAI-compatible chat endpoint also available. |

**Model routing pattern:** Single `callLLM(provider, model, messages, tools)` abstraction that dispatches to the right SDK. Don't expose SDK internals to handlers.

### MCP Tool Integrations

| MCP Server | How to Run | Transport | When to Use |
|------------|------------|-----------|-------------|
| **@modelcontextprotocol/server-filesystem** | `npx @modelcontextprotocol/server-filesystem` | stdio | Obsidian vault read/write. Direct filesystem, no plugin required. |
| **marcelmarais/obsidian-mcp-server** (or mcpvault) | `npx` | stdio | Richer Obsidian operations: daily note append, frontmatter, search. Alternative to generic filesystem. |
| **Google MCP servers** | Remote URL | StreamableHTTP | Gmail, Calendar, Drive via Google's hosted MCP endpoints. |
| **Notion MCP** | `https://mcp.notion.com/mcp` | StreamableHTTP | Notion integration. Bearer token auth. |
| **GitHub MCP** | Remote URL | StreamableHTTP | Issues, PRs, CI status. |
| **Custom skills server** | Local process | stdio | Skills system: project-authored MCP server that exposes skill workflows as tools. |

**Transport decision:**
- Local tools (filesystem, vault) → **stdio** (spawn as child process, zero network overhead, no auth needed)
- Remote services (Google, Notion, GitHub) → **StreamableHTTP** (they're already hosted, just URL + token)

### Scheduling

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **node-cron** | 4.2.x | In-process cron scheduler | Morning briefs, evening digests, any time-based task. Supports timezones (`Asia/Singapore`). `noOverlap: true` prevents re-entrancy. |

### State Management

| Approach | Purpose | Notes |
|---------|---------|-------|
| **In-memory Map + periodic JSON flush** | Conversation history (24h window) | Simplest option. Survives process restart via JSON file. Max 20 turns per chat, same as Phase 1 design. |
| **better-sqlite3 (optional)** | Conversation + skills state if JSON proves insufficient | Only pull in if structured queries become necessary. Avoid premature DB overhead. |

**Recommendation:** Start with JSON file persistence. SQLite only if you need search, multi-index, or >1000 conversations.

### Process Management

| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| **PM2** | 7.0.x | Process manager, auto-restart, launchd integration | `pm2 startup` generates a launchd plist. `pm2 save` persists process list across reboots. Built-in log rotation. Always-on on Mac mini. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **Vitest** | Unit + integration tests | Already in use. Keep it — no migration needed. `environment: 'node'` (drop `@cloudflare/vitest-pool-workers`). |
| **tsx** | Run TypeScript directly | `tsx src/index.ts` for dev without compile step. Use `tsx watch` for hot reload during development. |
| **dotenv** (or Node 22 `--env-file`) | Load `.env` locally | Prefer `node --env-file=.env` (Node 22 built-in) to avoid a dependency. Fall back to `dotenv/config` import if Node <22. |
| **Tailscale Funnel** | Public HTTPS exposure | Already running. `tailscale funnel 3000` exposes port 3000 at `<hostname>.ts.net`. Auto-provisions TLS. Only ports 443, 8443, 10000 available to Funnel — server must listen on one of these or let Tailscale proxy from its port to yours. |

---

## Installation

```bash
# Core server
npm install hono @hono/node-server

# LLM providers
npm install @anthropic-ai/sdk openai ollama

# MCP
npm install @modelcontextprotocol/sdk

# Scheduling
npm install node-cron

# Input validation (already used indirectly, worth being explicit)
npm install zod

# Dev dependencies
npm install -D typescript tsx vitest @types/node

# Process manager (global install)
npm install -g pm2
```

```bash
# Node 22 — no dotenv needed:
node --env-file=.env src/index.ts

# OR if using tsx:
tsx --env-file=.env src/index.ts
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Hono + `@hono/node-server` | Fastify | If you need plugin ecosystem (OpenAPI, auth plugins). Hono is better for this project because existing CF Workers handlers migrate without rewriting. |
| Hono | Express 4.x | Never for new projects in 2025. Express has no native TypeScript, no ESM, and is ~4x slower. |
| `@anthropic-ai/sdk` (direct) | Vercel AI SDK | AI SDK is excellent for multi-provider abstraction but adds a layer between you and the Anthropic MCP connector beta. For this project's level of Anthropic-specific feature use, direct SDK is better. |
| `@modelcontextprotocol/sdk` (MCP client) | Anthropic MCP Connector (beta) | Anthropic's MCP Connector is a hosted proxy that lets you specify `mcp_servers[]` in the API call — simpler for remote servers. But it's a beta API with a required `anthropic-beta` header. Use Anthropic connector for remote MCP servers (Notion, Google); use `@modelcontextprotocol/sdk` for local stdio servers (filesystem, vault). |
| `node-cron` | `@node-cron/standalone`, `cron` (kelektiv) | `node-cron` 4.x has better timezone support and `noOverlap` option. Either works but `node-cron` is more actively maintained. |
| JSON file state | better-sqlite3 | Use SQLite only when you need: full-text search across notes, multi-index queries, concurrent writes, or conversation log >1000 entries. |
| PM2 | launchd plist (manual) | Manual launchd is more macOS-native but harder to iterate on. PM2 wraps launchd via `pm2 startup` and adds restart-on-crash, log management, and a process dashboard. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `node-telegram-bot-api` | Heavy wrapper with its own event loop, polling mode risks, callback API diverges from raw Telegram types. Already excluded in CLAUDE.md. | Raw `fetch` to Telegram Bot API (existing pattern, keep it). |
| `axios` | Unnecessary. Node 22 has native `fetch`. Already excluded in CLAUDE.md. | Native `fetch`. |
| `MarkdownV2` parse mode | Requires escaping `_*[]()~>#+\-=|{}.!`. Claude output will always contain these characters unescaped. Already established as anti-pattern. | HTML parse mode (existing). |
| Deno / Bun | Runtime switch mid-project. No benefit large enough to justify migration cost when Node.js 22 has native ESM, fetch, and `--env-file`. | Node.js 22 LTS. |
| `wrangler` (after migration) | CF Workers runtime. Once on Mac mini, wrangler dev and deploy are irrelevant. | PM2 + Node.js directly. |
| `@cloudflare/vitest-pool-workers` | Workers-specific test pool. Unnecessary after migration. Already flagged as "not using" in vitest.config.ts (`environment: 'node'`). | Vitest with `environment: 'node'` (already the config). |
| MongoDB / Postgres | Overkill for single-user personal agent. Heavy infra, no operational benefit. | JSON file or SQLite (better-sqlite3). |
| Redis | Same as above. Requires separate process, no benefit for single-user workload. | In-memory Map with JSON flush. |
| n8n / Zapier / Make | External automation platforms. Introduce dependencies, rate limits, and cost for what should be code. Skills system is the in-process equivalent. | Custom skills system (MCP-based). |

---

## Stack Patterns by Variant

**If running local Obsidian vault MCP (no REST plugin):**
- Use `@modelcontextprotocol/server-filesystem` via stdio transport
- Point it at vault root: `npx @modelcontextprotocol/server-filesystem /path/to/vault`
- MCP client in-process connects via `StdioClientTransport`

**If Obsidian app is running and Local REST API plugin is installed:**
- Use `mcp-obsidian` (MarkusPfundstein variant) which talks to `http://localhost:27123`
- Advantage: app-aware operations (e.g. open note in Obsidian)
- Disadvantage: Obsidian app must be running

**Recommendation:** Use direct filesystem (`@modelcontextprotocol/server-filesystem`) as the default. It has no runtime dependencies and the vault is just markdown files. Reserve Local REST API plugin approach for v2 if you need app-level features (inline commands, Templater, etc.).

**If model routing between Claude / GPT / Ollama:**
- Abstract behind a single `callLLM(config, messages)` function in `src/core/llm.ts`
- Config: `{ provider: 'anthropic' | 'openai' | 'ollama', model: string }`
- Each provider returns `{ text: string, usage: { inputTokens, outputTokens } }`
- Don't expose provider SDK types outside `src/core/llm.ts`

**If Anthropic MCP connector (remote servers):**
```typescript
// In messages.create call:
{
  model: 'claude-sonnet-4-6',
  messages: [...],
  mcp_servers: [
    { type: 'url', url: 'https://mcp.notion.com/mcp', name: 'notion', authorization_token: env.NOTION_TOKEN }
  ]
}
// Requires header: 'anthropic-beta': 'mcp-client-2025-04-04'
// Check current beta header name in official docs at build time — it changes between betas.
```

**If running custom skills MCP server (in-process):**
```typescript
// Spawn as child process, connect via stdio
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['src/skills/server.js']
});
const client = new Client({ name: 'orchestrator', version: '1.0.0' });
await client.connect(transport);
```

---

## Version Compatibility

| Package | Version | Compatible With | Notes |
|---------|---------|-----------------|-------|
| `hono` | 4.12.x | `@hono/node-server` 2.0.x | Must use matched minor versions. 4.x and node-server 2.x are the current stable pair. |
| `@anthropic-ai/sdk` | 0.93.x | Node.js 18+ | Requires `ANTHROPIC_API_KEY` env var or explicit `apiKey` param. |
| `@modelcontextprotocol/sdk` | 1.29.x | Node.js 18+ | Imports use `.js` extensions — use `"moduleResolution": "bundler"` or `"node16"` in tsconfig. |
| `node-cron` | 4.2.x | Node.js 16+ | `noOverlap` added in v4. Don't use v3 (missing this feature). |
| `ollama` | 0.6.x | Ollama server 0.6+ on UNRAID | JS library wraps REST API. Ensure Ollama server version matches or exceeds SDK version. |
| `openai` | 6.36.x | Node.js 18+ | v6 uses native `fetch`, no `axios`. Breaking change from v4 in response shape — use v6 directly, don't reference old v4 patterns. |
| TypeScript | 5.8+ | Node.js 22 | `"target": "ES2022"`, `"module": "NodeNext"` or `"ESNext"`. |

---

## Sources

- `/anthropics/anthropic-sdk-typescript` (Context7) — MCP tool runner, streaming, version 0.93.x confirmed
- `/modelcontextprotocol/typescript-sdk` (Context7) — stdio and StreamableHTTP transport, version 1.29.x via npm
- `/websites/hono_dev` (Context7) — Node.js adapter setup, route patterns
- `/node-cron/node-cron` (Context7) — timezone support, `noOverlap` option
- `/ollama/ollama-js` (Context7) — chat API, tool support
- https://www.npmjs.com/package/@anthropic-ai/sdk — version 0.93.x confirmed
- https://www.npmjs.com/package/@modelcontextprotocol/sdk — version 1.29.x confirmed
- https://tailscale.com/kb/1223/funnel — port constraints (443, 8443, 10000 only)
- https://pm2.keymetrics.io/docs/usage/startup/ — launchd integration confirmed
- https://github.com/bitbonsai/mcpvault — direct vault filesystem MCP, no plugin required
- https://github.com/marcelmarais/obsidian-mcp-server — lightweight vault MCP
- https://www.pkgpulse.com/blog/express-vs-hono-2026 — Hono vs Express 2026 comparison
- npm registry: `hono@4.12.17`, `@hono/node-server@2.0.1`, `openai@6.36.0`, `node-cron@4.2.1`, `pm2@7.0.1`, `ollama@0.6.3`, `zod@4.4.3`, `tsx@4.21.0`, `@types/node@25.6.0` — versions current as of 2026-05-06

---

*Stack research for: Personal AI Orchestration Agent (Mac mini migration)*
*Researched: 2026-05-06*
