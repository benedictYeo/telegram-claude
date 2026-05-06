# Telegram Claude Orchestrator

Personal AI orchestration layer running on Mac mini. Accessible via Telegram.

## Prerequisites

- macOS (Mac mini, always-on)
- Node.js 20+ (`brew install node` or via nvm)
- Tailscale installed and logged in (`brew install tailscale`)
- Telegram bot token (from [@BotFather](https://t.me/BotFather))

## Quick Start

```bash
# Clone and install
git clone <repo-url>
cd telegram-claude
npm install

# Configure secrets
cp .env.example .env
# Edit .env with your secrets (see below)

# Run setup (installs PM2, configures sleep prevention, registers webhook)
./scripts/setup.sh
```

## Environment Variables

| Variable | Description | Source |
|----------|-------------|--------|
| `TELEGRAM_BOT_TOKEN` | Bot API token | BotFather -> /mybots -> API Token |
| `TELEGRAM_WEBHOOK_SECRET` | Webhook signature secret | `openssl rand -hex 32` |
| `ALLOWED_USER_ID` | Your Telegram user ID | Send /start to @userinfobot |
| `ANTHROPIC_API_KEY` | Anthropic API key (Phase 2+) | console.anthropic.com |
| `PORT` | Server port (default: 3000) | -- |

## Architecture

```
Telegram -> Tailscale Funnel (HTTPS) -> Hono (localhost:3000) -> PM2
```

- **Hono** -- HTTP framework (Node.js)
- **PM2** -- Process manager (crash recovery, reboot survival)
- **Tailscale Funnel** -- Public HTTPS endpoint (no port forwarding)
- **caffeinate** -- Sleep prevention (PM2 companion process)

## Commands

| Command | Description |
|---------|-------------|
| `/ping` | Confirm bot is alive |
| `/help` | Show available commands |

## Development

```bash
# Run locally (with hot reload)
npm run dev

# Run tests
npm test

# Type check
npm run typecheck

# Lint
npm run lint

# Format
npm run format
```

## PM2 Operations

```bash
pm2 list              # Show running processes
pm2 logs tg-claude    # View logs
pm2 restart tg-claude # Restart server
pm2 monit             # Monitor dashboard
```

## Tailscale Funnel

The webhook requires a public HTTPS URL. Tailscale Funnel provides this:

```bash
# Check funnel status
tailscale funnel status

# Start funnel (if not running)
tailscale funnel --bg 3000
```

**Note:** On first setup, `tailscale funnel 3000` requires interactive browser approval. After that, `--bg` runs it in the background.
