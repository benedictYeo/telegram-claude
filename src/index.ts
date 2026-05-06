import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { telegramWebhook } from "./routes/telegram.js";
import { logger } from "./lib/logger.js";

const app = new Hono();

// INFRA-09: Health check — no auth, no info disclosure
app.get("/health", (c) => c.text("ok"));

// Telegram webhook
app.post("/webhook", telegramWebhook);

// Catch-all 404
app.all("*", (c) => c.text("not found", 404));

// Export app for testing (named export)
export { app };

// Start server only when not in test mode
if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 3000);
  serve({ fetch: app.fetch, port }, () => {
    logger.info({ port }, "Server started");
  });
}
