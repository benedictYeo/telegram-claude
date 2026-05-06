import type { Env } from "../types.js";

const TG_API = "https://api.telegram.org";
const MAX_CHUNK = 4000;

export function chunkMessage(text: string, max = MAX_CHUNK): string[] {
  if (text.length === 0) return [""];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += max) {
    chunks.push(text.slice(i, i + max));
  }
  return chunks;
}

export async function tgSend(
  env: Env,
  chatId: number,
  text: string,
  parseMode = "HTML",
): Promise<void> {
  const chunks = chunkMessage(text);
  for (const chunk of chunks) {
    await fetch(`${TG_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: parseMode }),
    });
  }
}

export async function tgSendChatAction(
  env: Env,
  chatId: number,
  action: "typing" | "upload_document" | "find_location",
): Promise<void> {
  await fetch(`${TG_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action }),
  });
}
