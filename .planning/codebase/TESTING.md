# Testing Patterns

**Analysis Date:** 2026-05-05

## Test Framework

**Runner:**
- Vitest 4.1.4
- Config: `vitest.config.ts`
- Environment: `node` (not Miniflare/worker pool yet, despite `@cloudflare/vitest-pool-workers` being installed)

**Assertion Library:**
- Vitest built-in `expect` (Chai-compatible)

**Run Commands:**
```bash
npm test                # Run all tests once (vitest run)
npm run test:watch      # Watch mode (vitest)
npm run typecheck       # Type checking only (tsc)
```

**No coverage command configured.** No coverage thresholds set.

## Test File Organization

**Location:**
- Separate `test/` directory at project root (not co-located with source)
- Flat structure: all test files directly in `test/`, no subdirectories

**Naming:**
- `{module}.test.ts` pattern
- Test file name matches the module being tested, not the full path:
  - `test/auth.test.ts` tests `src/core/auth.ts`
  - `test/chunking.test.ts` tests `src/core/telegram.ts` (specifically the `chunkMessage` function)

**Current test files:**
```
test/
├── auth.test.ts       # Tests checkWebhookSignature + checkUserAllowed
└── chunking.test.ts   # Tests chunkMessage
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect } from "vitest";
import { functionUnderTest } from "../src/module/path.js";
import type { TypeNeeded } from "../src/types.js";

describe("functionUnderTest", () => {
  it("describes expected behavior for valid input", () => {
    // arrange
    const input = makeInput();
    // act
    const result = functionUnderTest(input);
    // assert
    expect(result).toBe(expectedValue);
  });

  it("describes expected behavior for edge case", () => {
    // ...
  });
});
```

**Patterns:**
- One `describe` block per function being tested
- `it` descriptions use plain English starting with a verb: "returns null for valid secret", "allows matching user ID from message", "splits at max+1 chars into two chunks"
- Arrange-Act-Assert pattern (implicit, not commented)
- No `beforeEach`/`afterEach` hooks used. Setup is inline or via helper functions.
- No `beforeAll`/`afterAll` hooks used.

## Mocking

**Framework:** None currently used.

**Current approach:**
- No mocking framework or `vi.mock()` calls in the codebase
- Tests focus on pure functions that can be tested without mocks
- `Env` objects are constructed manually using a factory helper (see below)
- `Request` objects use the native Web API `Request` constructor
- KV namespaces are stubbed as empty objects: `CONV: {} as KVNamespace`

**What is tested without mocks:**
- Pure logic functions: `chunkMessage`, `checkUserAllowed`, `checkWebhookSignature`
- Functions that only depend on `Env` and `Request` (no external API calls)

**What is NOT yet tested (would require mocking):**
- `tgSend` and `tgSendChatAction` (make `fetch` calls to Telegram API)
- `handleTelegramWebhook` (calls auth + telegram modules)
- Worker `fetch` handler (integration-level)

## Fixtures and Factories

**Test Data Factories:**

`makeEnv()` - Creates a complete `Env` object with sensible defaults:
```typescript
function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    TELEGRAM_BOT_TOKEN: "bot-token",
    TELEGRAM_WEBHOOK_SECRET: "correct-secret",
    ALLOWED_USER_ID: "12345",
    ANTHROPIC_API_KEY: "anthropic-key",
    WEBHOOK_SECRET: "webhook-secret",
    CONV: {} as KVNamespace,
    OAUTH: {} as KVNamespace,
    ...overrides,
  };
}
```

`makeRequest()` - Creates a `Request` with optional secret header:
```typescript
function makeRequest(secret: string | null): Request {
  const headers = new Headers();
  if (secret !== null) {
    headers.set("X-Telegram-Bot-Api-Secret-Token", secret);
  }
  return new Request("https://example.com/webhook", { method: "POST", headers });
}
```

**Pattern for new factories:** Define factories at the top of the test file, before `describe` blocks. Use `Partial<T>` with spread for overrides. Keep them local to the test file (no shared fixture module yet).

**Inline fixtures:** `TgUpdate` objects are constructed inline within `it` blocks, since they vary per test case:
```typescript
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
```

**Location:**
- No shared fixtures directory. All factories are local to their test file.
- As the test suite grows, consider extracting `makeEnv` into `test/helpers/env.ts` since it will be needed by every test.

## Coverage

**Requirements:** None enforced. No coverage thresholds configured.

**View Coverage:**
```bash
npx vitest run --coverage   # Not configured, would need @vitest/coverage-v8
```

## Test Types

**Unit Tests:**
- All current tests are unit tests targeting individual exported functions
- Test pure logic in isolation: auth checks, string chunking
- No integration or end-to-end tests exist yet

**Integration Tests:**
- Not implemented yet
- `@cloudflare/vitest-pool-workers` is installed but not configured (vitest uses `environment: "node"` not `environment: "miniflare"`)
- When wired up, will enable testing full Worker request/response cycles with KV mocking

**E2E Tests:**
- Not used. Smoke testing is manual per CLAUDE.md ("Stop at phase boundary for manual smoke test")

## Common Patterns

**Testing Guard Functions (returns Response | null):**
```typescript
it("returns null for valid input", () => {
  const result = checkWebhookSignature(req, makeEnv());
  expect(result).toBeNull();
});

it("returns 401 for invalid input", () => {
  const result = checkWebhookSignature(req, makeEnv());
  expect(result).not.toBeNull();
  expect(result!.status).toBe(401);
});
```
Note the non-null assertion `result!.status` after checking `result` is not null.

**Testing Boolean Check Functions:**
```typescript
it("allows matching user ID from message", () => {
  expect(checkUserAllowed(update, makeEnv())).toBe(true);
});

it("rejects wrong user ID from message", () => {
  expect(checkUserAllowed(update, makeEnv())).toBe(false);
});
```

**Testing Pure Transformation Functions:**
```typescript
it("splits at boundary into expected chunks", () => {
  const text = "a".repeat(4001);
  const result = chunkMessage(text);
  expect(result).toHaveLength(2);
  expect(result[0]).toHaveLength(4000);
  expect(result[1]).toHaveLength(1);
});
```

**Boundary Value Testing:**
- Tests cover empty input, single char, exact boundary (4000), boundary+1 (4001), and multiples
- Custom parameter overrides tested: `chunkMessage(text, 2)` with custom max

**Where to Add New Tests:**
- Create `test/{module-name}.test.ts` for each new module
- Import from `../src/{path}.js` (relative path with `.js` extension)
- Import `{ describe, it, expect }` from `"vitest"`
- Redefine or import `makeEnv()` helper as needed
- Test pure functions first; defer mocking until integration tests are wired

## Testing Gaps and Future Work

- **No handler tests:** `handleTelegramWebhook` is untested (requires mocking `req.json()` and `tgSend`)
- **No Telegram API tests:** `tgSend` and `tgSendChatAction` are untested (requires `fetch` mocking)
- **No Worker integration tests:** `@cloudflare/vitest-pool-workers` installed but not configured
- **No shared test utilities:** Each test file defines its own helpers
- **No coverage reporting:** No `@vitest/coverage-v8` or equivalent installed

---

*Testing analysis: 2026-05-05*
