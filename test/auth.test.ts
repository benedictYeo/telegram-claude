import { describe, it, expect } from "vitest";
import { checkWebhookSignature, checkUserAllowed } from "../src/core/auth.js";
import type { Env, TgUpdate } from "../src/types.js";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    TELEGRAM_BOT_TOKEN: "bot-token",
    TELEGRAM_WEBHOOK_SECRET: "correct-secret",
    ALLOWED_USER_ID: "12345",
    ANTHROPIC_API_KEY: "anthropic-key",
    ...overrides,
  };
}

function makeRequest(secret: string | null): Request {
  const headers = new Headers();
  if (secret !== null) {
    headers.set("X-Telegram-Bot-Api-Secret-Token", secret);
  }
  return new Request("https://example.com/webhook", { method: "POST", headers });
}

describe("checkWebhookSignature", () => {
  it("returns null for valid secret", () => {
    const req = makeRequest("correct-secret");
    const result = checkWebhookSignature(req, makeEnv());
    expect(result).toBeNull();
  });

  it("returns 401 for wrong secret", () => {
    const req = makeRequest("wrong-secret");
    const result = checkWebhookSignature(req, makeEnv());
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it("returns 401 when header is missing", () => {
    const req = makeRequest(null);
    const result = checkWebhookSignature(req, makeEnv());
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });
});

describe("checkUserAllowed", () => {
  it("allows matching user ID from message", () => {
    const update: TgUpdate = {
      update_id: 1,
      message: {
        message_id: 1,
        from: { id: 12345, is_bot: false, first_name: "Ben" },
        chat: { id: 12345, type: "private" },
        date: 0,
        text: "hi",
      },
    };
    expect(checkUserAllowed(update, makeEnv())).toBe(true);
  });

  it("rejects wrong user ID from message", () => {
    const update: TgUpdate = {
      update_id: 2,
      message: {
        message_id: 2,
        from: { id: 99999, is_bot: false, first_name: "Stranger" },
        chat: { id: 99999, type: "private" },
        date: 0,
        text: "hi",
      },
    };
    expect(checkUserAllowed(update, makeEnv())).toBe(false);
  });

  it("allows matching user ID from callback_query", () => {
    const update: TgUpdate = {
      update_id: 3,
      callback_query: {
        id: "cq1",
        from: { id: 12345, is_bot: false, first_name: "Ben" },
        data: "action",
      },
    };
    expect(checkUserAllowed(update, makeEnv())).toBe(true);
  });

  it("rejects when no from field present", () => {
    const update: TgUpdate = { update_id: 4 };
    expect(checkUserAllowed(update, makeEnv())).toBe(false);
  });
});
