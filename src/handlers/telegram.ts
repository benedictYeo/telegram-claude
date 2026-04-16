import type { Env, TgUpdate } from "../types.js";
import { checkWebhookSignature, checkUserAllowed } from "../core/auth.js";
import { tgSend } from "../core/telegram.js";

export async function handleTelegramWebhook(
  req: Request,
  env: Env,
  _ctx: ExecutionContext
): Promise<Response> {
  const authFail = checkWebhookSignature(req, env);
  if (authFail) return authFail;

  let update: TgUpdate;
  try {
    update = await req.json<TgUpdate>();
  } catch {
    return new Response("ok");
  }

  if (!checkUserAllowed(update, env)) {
    // Silent drop — no log, no error
    return new Response("ok");
  }

  const msg = update.message;
  if (!msg?.text) return new Response("ok");

  const chatId = msg.chat.id;
  const text = msg.text;

  await tgSend(env, chatId, text);

  return new Response("ok");
}
