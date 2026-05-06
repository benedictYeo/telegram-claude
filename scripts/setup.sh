#!/usr/bin/env bash
set -euo pipefail

# Telegram Claude Orchestrator -- Mac mini Setup
# Run this script ONCE on the Mac mini to configure the server environment.
# Prerequisites: Node.js 20+, npm, Tailscale installed and logged in.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Telegram Claude Orchestrator Setup ==="
echo "Project directory: $PROJECT_DIR"
echo ""

# 1. Check prerequisites
echo "--- Checking prerequisites ---"
command -v node >/dev/null 2>&1 || { echo "ERROR: Node.js not found. Install Node.js 20+ first."; exit 1; }
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "ERROR: Node.js 20+ required. Found: $(node -v)"
  exit 1
fi
echo "Node.js: $(node -v)"
echo "npm: $(npm -v)"

command -v tailscale >/dev/null 2>&1 || { echo "ERROR: Tailscale not found. Install Tailscale first."; exit 1; }
echo "Tailscale: $(tailscale version | head -1)"
echo ""

# 2. Install project dependencies
echo "--- Installing project dependencies ---"
cd "$PROJECT_DIR"
npm install
echo ""

# 3. Install PM2 globally (D-07)
echo "--- Installing PM2 ---"
npm install -g pm2 tsx
echo "PM2: $(pm2 -v)"
echo ""

# 4. Configure sleep prevention (D-06)
echo "--- Configuring sleep prevention ---"
echo "Setting pmset to prevent sleep (requires sudo)..."
sudo pmset -a sleep 0 disksleep 0 displaysleep 0
echo "pmset configured: sleep 0, disksleep 0, displaysleep 0"
echo ""

# 5. Check .env file
echo "--- Checking .env file ---"
if [ ! -f "$PROJECT_DIR/.env" ]; then
  echo "WARNING: .env file not found."
  echo "Copy .env.example to .env and fill in your secrets:"
  echo "  cp .env.example .env"
  echo "  nano .env"
  echo ""
  echo "Required secrets:"
  echo "  TELEGRAM_BOT_TOKEN     -- from BotFather"
  echo "  TELEGRAM_WEBHOOK_SECRET -- generate with: openssl rand -hex 32"
  echo "  ALLOWED_USER_ID        -- your Telegram user ID (send /start to @userinfobot)"
  echo ""
  read -p "Press Enter after creating .env, or Ctrl+C to abort..." _
fi
echo ".env file found."
echo ""

# 6. Start PM2 apps
echo "--- Starting PM2 apps ---"
cd "$PROJECT_DIR"
pm2 start ecosystem.config.cjs
echo ""

# 7. Configure PM2 startup for reboot survival (D-07)
echo "--- Configuring PM2 startup (launchd) ---"
echo "Running pm2 startup. You may be prompted for sudo password."
pm2 startup launchd
echo ""
echo "If PM2 printed a sudo command above, run it now."
echo "Then run: pm2 save"
echo ""
read -p "Press Enter after running the sudo command and pm2 save..." _
pm2 save
echo ""

# 8. Install PM2 log rotation (D-08)
echo "--- Installing pm2-logrotate ---"
pm2 install pm2-logrotate
echo ""

# 9. Tailscale Funnel setup (D-09)
echo "--- Setting up Tailscale Funnel ---"
echo "This step requires interactive approval in your browser."
echo "Running: tailscale funnel 3000"
echo ""
tailscale funnel 3000
echo ""
echo "Funnel should now be active. Running in background..."
tailscale funnel --bg 3000
FUNNEL_URL=$(tailscale funnel status 2>/dev/null | grep -o 'https://[^ ]*' | head -1 || echo "UNKNOWN")
echo "Funnel URL: $FUNNEL_URL"
echo ""

# 10. Register Telegram webhook (D-20)
echo "--- Registering Telegram webhook ---"
source "$PROJECT_DIR/.env"
if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_WEBHOOK_SECRET:-}" ]; then
  echo "ERROR: TELEGRAM_BOT_TOKEN or TELEGRAM_WEBHOOK_SECRET not set in .env"
  exit 1
fi

if [ "$FUNNEL_URL" = "UNKNOWN" ]; then
  echo "WARNING: Could not detect Funnel URL automatically."
  read -p "Enter your Tailscale Funnel URL (e.g., https://your-machine.ts.net): " FUNNEL_URL
fi

echo "Registering webhook at: ${FUNNEL_URL}/webhook"
curl -s -X POST \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"${FUNNEL_URL}/webhook\",
    \"secret_token\": \"${TELEGRAM_WEBHOOK_SECRET}\",
    \"allowed_updates\": [\"message\", \"callback_query\"]
  }" | python3 -m json.tool 2>/dev/null || echo "(raw response above)"
echo ""

# 11. Verify
echo "--- Verification ---"
pm2 list
echo ""
echo "Health check:"
curl -s "http://localhost:3000/health" && echo " (should be 'ok')" || echo " FAILED"
echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Send a message to your bot in Telegram"
echo "  2. Check logs: pm2 logs tg-claude"
echo "  3. Monitor: pm2 monit"
