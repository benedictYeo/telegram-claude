import type { Env } from "./types.js";
import { handleTelegramWebhook } from "./handlers/telegram.js";

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "POST" && url.pathname === "/webhook") {
      return handleTelegramWebhook(req, env, ctx);
    }

    if (req.method === "GET" && url.pathname === "/health") {
      return new Response("ok");
    }

    return new Response("not found", { status: 404 });
  },

  async scheduled(_event: ScheduledEvent, _env: Env, _ctx: ExecutionContext): Promise<void> {
    // Stub — cron handlers wired in Phase 5
  },
};
