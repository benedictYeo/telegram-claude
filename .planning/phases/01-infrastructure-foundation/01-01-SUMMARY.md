---
phase: 01-infrastructure-foundation
plan: 01
subsystem: project-scaffold
tags: [scaffold, dependencies, config, archive, logger, eslint, prettier, lefthook]
dependency_graph:
  requires: []
  provides: [package.json, tsconfig.json, eslint.config.js, .prettierrc, lefthook.yml, .env.example, src/types.ts, src/lib/logger.ts]
  affects: [src/index.ts, src/handlers/telegram.ts, src/core/auth.ts, src/core/telegram.ts, test/auth.test.ts]
tech_stack:
  added: [hono, "@hono/node-server", tsx, dotenv, pino, pino-pretty, better-sqlite3, eslint, prettier, lefthook, typescript-eslint, "@eslint/js", supertest]
  removed: ["@cloudflare/vitest-pool-workers", "@cloudflare/workers-types", wrangler]
  patterns: [ESLint 10 flat config, pino structured logging, lefthook pre-commit hooks]
key_files:
  created: [eslint.config.js, .prettierrc, lefthook.yml, .env.example, archive/README.md, src/lib/logger.ts]
  modified: [package.json, tsconfig.json, .gitignore, src/types.ts, src/index.ts, src/handlers/telegram.ts, test/auth.test.ts]
decisions:
  - "ESLint 10 requires @eslint/js and typescript-eslint as separate packages (not bundled)"
  - "types.ts port included in scaffold commit since pre-commit typecheck requires clean compilation"
metrics:
  duration: 6m
  completed: "2026-05-06T04:16:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 6
  files_modified: 7
---

# Phase 01 Plan 01: Project Scaffold Summary

Node.js project scaffold with Hono, pino, SQLite deps; ESLint 10 flat config + Prettier + lefthook; types ported from CF Workers to Node.js; pino logger singleton created.

## What Was Done

### Task 1: Install dependencies, update configs, archive old CF code

Replaced all Cloudflare Workers dependencies (wrangler, @cloudflare/workers-types, @cloudflare/vitest-pool-workers) with Node.js equivalents (hono, @hono/node-server, tsx, dotenv, pino, better-sqlite3). Updated tsconfig.json to target @types/node instead of @cloudflare/workers-types. Created ESLint 10 flat config with typescript-eslint + Prettier integration, .prettierrc with project conventions (double quotes, semicolons, trailing commas, 2-space indent), and lefthook pre-commit hooks running lint + format + typecheck in parallel.

Archived all existing CF Workers source to `archive/` and removed `wrangler.toml` from project root. Created `.env.example` with all required secrets and server config. Added `data/` to `.gitignore` for future SQLite database. Added `!.env.example` negation to .gitignore so the template can be committed alongside the `.env*` pattern.

Also ported `src/types.ts` (removed KVNamespace, WEBHOOK_SECRET) and fixed `src/index.ts`, `src/handlers/telegram.ts`, and `test/auth.test.ts` to remove CF Workers type references (ExecutionContext, ScheduledEvent, req.json generic) -- required for pre-commit typecheck to pass.

**Commit:** `95177b7`

### Task 2: Port types.ts and create logger module

Created `src/lib/logger.ts` with pino singleton. Debug level + pino-pretty transport in development, info level + JSON output in production. Single named export `logger` for use by all modules. Types.ts port was completed as part of Task 1 (required for compilation).

**Commit:** `8891972`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ESLint 10 missing @eslint/js package**
- **Found during:** Task 1
- **Issue:** ESLint 10 does not bundle `@eslint/js` as a dependency. The eslint.config.js import of `@eslint/js` failed at runtime.
- **Fix:** Installed `@eslint/js` as a devDependency (`npm install -D @eslint/js`).
- **Files modified:** package.json, package-lock.json
- **Commit:** 95177b7

**2. [Rule 3 - Blocking] ESLint 10 requires unified typescript-eslint package**
- **Found during:** Task 1
- **Issue:** The plan specified `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` separately, but the modern flat config pattern uses `import tseslint from "typescript-eslint"` which requires the unified `typescript-eslint` package.
- **Fix:** Installed `typescript-eslint` as a devDependency. Kept the separate packages as they are peer dependencies.
- **Files modified:** package.json, package-lock.json
- **Commit:** 95177b7

**3. [Rule 3 - Blocking] Pre-commit hook prevents Task 1 commit without type fixes**
- **Found during:** Task 1 commit
- **Issue:** lefthook pre-commit runs `npx tsc`, which fails because `src/types.ts` still references `KVNamespace` and source files reference `ExecutionContext`/`ScheduledEvent`. These are Task 2 scope but blocking Task 1 commit.
- **Fix:** Merged Task 2's types.ts port into Task 1 commit. Also fixed `src/index.ts` (removed ExecutionContext, ScheduledEvent), `src/handlers/telegram.ts` (removed ExecutionContext, fixed req.json generic), and `test/auth.test.ts` (removed KVNamespace from test helpers).
- **Files modified:** src/types.ts, src/index.ts, src/handlers/telegram.ts, test/auth.test.ts
- **Commit:** 95177b7

**4. [Rule 3 - Blocking] .env.example blocked by .gitignore .env* pattern**
- **Found during:** Task 1 commit
- **Issue:** `.env*` glob in .gitignore matched `.env.example`, preventing `git add .env.example`.
- **Fix:** Added `!.env.example` negation rule to .gitignore.
- **Files modified:** .gitignore
- **Commit:** 95177b7

## Known Stubs

| File | Line | Stub | Resolution |
|------|------|------|------------|
| src/index.ts | 4 | `// Stub -- Hono app entry point wired in Plan 01-03` | Intentional -- replaced when Hono app is built in Plan 01-03 |

## Verification Results

- `npm install` -- completed (246 packages, 0 vulnerabilities)
- `npx tsc` -- zero errors
- `npx eslint src/ test/` -- clean (no errors)
- `npx prettier --check src/ test/` -- all files pass
- `npx vitest run` -- 13 tests passed (2 test files)
- `wrangler.toml` -- absent from project root (archived)
- `archive/` -- contains old CF Workers code + README.md

## Self-Check: PASSED

All 6 created files found. All 7 modified files found. Both commits (95177b7, 8891972) verified in git log.
