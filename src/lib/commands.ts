import type { Env } from "../types.js";
import { tgSend } from "./telegram.js";

type CommandHandler = (chatId: number, env: Env) => Promise<void>;

const commands = new Map<string, CommandHandler>([
  ["help", handleHelp],
  ["ping", handlePing],
]);

export async function routeCommand(text: string, chatId: number, env: Env): Promise<boolean> {
  if (!text.startsWith("/")) return false;
  const [cmd] = text.slice(1).split(" ");
  const handler = commands.get(cmd.toLowerCase());
  if (!handler) return false;
  await handler(chatId, env);
  return true;
}

async function handlePing(chatId: number, env: Env): Promise<void> {
  await tgSend(env, chatId, "pong");
}

async function handleHelp(chatId: number, env: Env): Promise<void> {
  await tgSend(
    env,
    chatId,
    "<b>Commands</b>\n/ping — confirm bot is alive\n/help — show this message",
  );
}
