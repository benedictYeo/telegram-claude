import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env } from "../src/types.js";

vi.mock("../src/lib/telegram.js", () => ({
  tgSend: vi.fn().mockResolvedValue(undefined),
}));

import { routeCommand } from "../src/lib/commands.js";
import { tgSend } from "../src/lib/telegram.js";

function makeEnv(): Env {
  return {
    TELEGRAM_BOT_TOKEN: "bot-token",
    TELEGRAM_WEBHOOK_SECRET: "correct-secret",
    ALLOWED_USER_ID: "12345",
    ANTHROPIC_API_KEY: "anthropic-key",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("routeCommand", () => {
  it("returns false for non-slash text", async () => {
    expect(await routeCommand("hello", 123, makeEnv())).toBe(false);
    expect(tgSend).not.toHaveBeenCalled();
  });

  it("returns false for unrecognized slash command (D-14)", async () => {
    expect(await routeCommand("/unknown", 123, makeEnv())).toBe(false);
    expect(tgSend).not.toHaveBeenCalled();
  });

  it("handles /ping and sends pong", async () => {
    expect(await routeCommand("/ping", 123, makeEnv())).toBe(true);
    expect(tgSend).toHaveBeenCalledWith(
      expect.objectContaining({ TELEGRAM_BOT_TOKEN: "bot-token" }),
      123,
      "pong",
    );
  });

  it("handles /help and sends command list", async () => {
    expect(await routeCommand("/help", 123, makeEnv())).toBe(true);
    expect(tgSend).toHaveBeenCalledWith(
      expect.objectContaining({ TELEGRAM_BOT_TOKEN: "bot-token" }),
      123,
      expect.stringContaining("/ping"),
    );
  });

  it("is case-insensitive for commands", async () => {
    expect(await routeCommand("/PING", 123, makeEnv())).toBe(true);
    expect(tgSend).toHaveBeenCalled();
  });

  it("handles commands with arguments (extracts command name only)", async () => {
    expect(await routeCommand("/ping extra args", 123, makeEnv())).toBe(true);
    expect(tgSend).toHaveBeenCalled();
  });
});
