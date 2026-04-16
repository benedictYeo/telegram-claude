import type { Env, TgUpdate } from "../types.js";

export function checkWebhookSignature(req: Request, env: Env): Response | null {
  const sig = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (sig !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  return null;
}

export function checkUserAllowed(update: TgUpdate, env: Env): boolean {
  const fromId = update.message?.from?.id ?? update.callback_query?.from?.id;
  if (fromId === undefined) return false;
  return String(fromId) === env.ALLOWED_USER_ID;
}
