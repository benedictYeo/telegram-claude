import { describe, it, expect, vi, beforeEach } from "vitest";
import { createServer } from "http";
import supertest from "supertest";

// Mock logger to capture error calls
const mockLoggerError = vi.fn();
vi.mock("../src/lib/logger.js", () => ({
  logger: {
    error: mockLoggerError,
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock telegram to capture tgSend calls and verify generic error message
const mockTgSend = vi.fn().mockResolvedValue(undefined);
const mockTgSendChatAction = vi.fn().mockResolvedValue(undefined);
vi.mock("../src/lib/telegram.js", () => ({
  tgSend: mockTgSend,
  tgSendChatAction: mockTgSendChatAction,
  chunkMessage: vi.fn((text: string) => [text]),
}));

// Mock commands to throw an error — simulates a failure inside processUpdate
vi.mock("../src/lib/commands.js", () => ({
  routeCommand: vi.fn().mockRejectedValue(new TypeError("test error")),
}));

// Import app after all mocks are set up
const { app } = await import("../src/index.js");
const { getRequestListener } = await import("@hono/node-server");

// Create HTTP server from Hono app for supertest
const server = createServer(getRequestListener(app.fetch));
const request = supertest(server);

const validSecret = "test-secret";
const validUserId = "12345";

function webhookPayload(text: string, fromId = Number(validUserId)) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      from: { id: fromId, is_bot: false, first_name: "Ben" },
      chat: { id: fromId, type: "private" },
      date: Math.floor(Date.now() / 1000),
      text,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Error handling (INFRA-11)", () => {
  it("webhook returns 200 immediately even when processUpdate will fail", async () => {
    const res = await request
      .post("/webhook")
      .set("X-Telegram-Bot-Api-Secret-Token", validSecret)
      .send(webhookPayload("hello"));
    // Ack-and-defer: 200 returned before setImmediate fires
    expect(res.status).toBe(200);
    expect(res.text).toBe("ok");
  });

  it("sends generic error message to user after processUpdate failure", async () => {
    await request
      .post("/webhook")
      .set("X-Telegram-Bot-Api-Secret-Token", validSecret)
      .send(webhookPayload("trigger error"));

    // Wait for setImmediate + promise rejection to propagate
    await new Promise((resolve) => setTimeout(resolve, 50));

    // tgSend should have been called with the generic error message
    expect(mockTgSend).toHaveBeenCalledWith(
      expect.anything(),
      Number(validUserId),
      "Something failed.",
    );
  });

  it("logs error type only, not message content", async () => {
    await request
      .post("/webhook")
      .set("X-Telegram-Bot-Api-Secret-Token", validSecret)
      .send(webhookPayload("sensitive user message content"));

    // Wait for setImmediate + promise rejection to propagate
    await new Promise((resolve) => setTimeout(resolve, 50));

    // logger.error should have been called with { type: "TypeError" }
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ type: "TypeError" }),
      expect.any(String),
    );

    // Verify the log payload does NOT contain user message content
    const logCall = mockLoggerError.mock.calls[0];
    expect(JSON.stringify(logCall[0])).not.toContain("sensitive");
    expect(JSON.stringify(logCall[0])).not.toContain("user message content");
  });
});
