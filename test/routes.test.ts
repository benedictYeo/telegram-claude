import { describe, it, expect, vi, beforeEach } from "vitest";
import { createServer } from "http";
import supertest from "supertest";

// Mock telegram.ts to prevent real API calls in tests
vi.mock("../src/lib/telegram.js", () => ({
  tgSend: vi.fn().mockResolvedValue(undefined),
  tgSendChatAction: vi.fn().mockResolvedValue(undefined),
  chunkMessage: vi.fn((text: string) => [text]),
}));

// Mock logger to prevent pino-pretty transport issues in test
vi.mock("../src/lib/logger.js", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

// Must import after mocks
const { app } = await import("../src/index.js");
const { getRequestListener } = await import("@hono/node-server");

// Create HTTP server from Hono app for supertest
const server = createServer(getRequestListener(app.fetch));
const request = supertest(server);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /health", () => {
  it("returns 200 ok (INFRA-09)", async () => {
    const res = await request.get("/health");
    expect(res.status).toBe(200);
    expect(res.text).toBe("ok");
  });

  it("does not disclose server info", async () => {
    const res = await request.get("/health");
    expect(res.text).toBe("ok");
    expect(res.text).not.toContain("version");
    expect(res.text).not.toContain("node");
  });
});

describe("POST /webhook", () => {
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

  it("returns 401 on missing secret header (INFRA-04)", async () => {
    const res = await request.post("/webhook").send(webhookPayload("hi"));
    expect(res.status).toBe(401);
  });

  it("returns 401 on wrong secret header (INFRA-04)", async () => {
    const res = await request
      .post("/webhook")
      .set("X-Telegram-Bot-Api-Secret-Token", "wrong-secret")
      .send(webhookPayload("hi"));
    expect(res.status).toBe(401);
  });

  it("returns 200 for valid request (INFRA-06 ack)", async () => {
    const res = await request
      .post("/webhook")
      .set("X-Telegram-Bot-Api-Secret-Token", validSecret)
      .send(webhookPayload("hello"));
    expect(res.status).toBe(200);
    expect(res.text).toBe("ok");
  });

  it("returns 200 silently for unauthorized user (INFRA-05)", async () => {
    const res = await request
      .post("/webhook")
      .set("X-Telegram-Bot-Api-Secret-Token", validSecret)
      .send(webhookPayload("hello", 99999));
    expect(res.status).toBe(200);
    expect(res.text).toBe("ok");
  });
});

describe("Catch-all 404", () => {
  it("returns 404 for unknown routes", async () => {
    const res = await request.get("/unknown");
    expect(res.status).toBe(404);
    expect(res.text).toBe("not found");
  });

  it("returns 404 for POST to unknown routes", async () => {
    const res = await request.post("/unknown").send({});
    expect(res.status).toBe(404);
  });
});
