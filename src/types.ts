export interface Env {
  // Secrets
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  ALLOWED_USER_ID: string;
  ANTHROPIC_API_KEY: string;
  WEBHOOK_SECRET: string;

  // KV Namespaces (added in later phases)
  CONV: KVNamespace;
  OAUTH: KVNamespace;
}

export interface TgUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

export interface TgChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
}

export interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  date: number;
  text?: string;
}

export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}
