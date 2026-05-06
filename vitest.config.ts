import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      TELEGRAM_BOT_TOKEN: "test-bot-token",
      TELEGRAM_WEBHOOK_SECRET: "test-secret",
      ALLOWED_USER_ID: "12345",
      ANTHROPIC_API_KEY: "test-anthropic-key",
      NODE_ENV: "test",
      PORT: "0",
    },
  },
});
