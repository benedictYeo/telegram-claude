import type { Context } from "hono";
import type { Env, TgUpdate, TgMessage } from "../types.js";
import { checkWebhookSignature, checkUserAllowed } from "../lib/auth.js";
import { tgSend, tgSendChatAction } from "../lib/telegram.js";
import { routeCommand } from "../lib/commands.js";
import { logger } from "../lib/logger.js";
import { getEnv } from "../env.js";

export async function telegramWebhook(c: Context): Promise<Response> {
  const env = getEnv();

  // Layer 1: Webhook signature check -> 401 on fail (INFRA-04)
  const authFail = checkWebhookSignature(c.req.raw, env);
  if (authFail) return authFail;

  // Parse body
  let update: TgUpdate;
  try {
    update = await c.req.json<TgUpdate>();
  } catch {
    return c.text("ok");
  }

  // Layer 2: User ID allowlist -> silent 200 drop (INFRA-05)
  if (!checkUserAllowed(update, env)) {
    return c.text("ok");
  }

  const msg = update.message;
  const chatId = msg?.chat.id;

  if (!chatId) return c.text("ok");

  // Ack-and-defer: schedule async work, return 200 immediately (INFRA-06)
  setImmediate(() => {
    processUpdate(msg!, env).catch((err: unknown) => {
      // INFRA-11: log error type only, send generic message to user
      logger.error({ type: (err as Error).constructor?.name ?? "Unknown" }, "processUpdate failed");
      tgSend(env, chatId, "Something failed.").catch(() => undefined);
    });
  });

  return c.text("ok");
}

async function processUpdate(msg: TgMessage, env: Env): Promise<void> {
  const chatId = msg.chat.id;

  // D-15: Non-text messages -> hint
  if (!msg.text) {
    await tgSend(env, chatId, "Text only for now.");
    return;
  }

  const text = msg.text;

  // INFRA-10: Slash command routing before AI dispatch (D-12, D-13, D-14)
  const handled = await routeCommand(text, chatId, env);
  if (handled) return;

  // INFRA-07: Typing indicator before AI call
  await tgSendChatAction(env, chatId, "typing");

  // D-16: Non-command text -> placeholder response (Phase 1, no AI yet)
  await tgSend(env, chatId, "Received. AI coming soon.");
}
