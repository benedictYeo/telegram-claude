# Phase 2: Conversation Core - Discussion Log

**Date:** 2026-05-06
**Areas Discussed:** Conversation memory, System prompt, Status command, Model selection
**Mode:** Default (interactive)

## Conversation Memory

### Q1: Context management strategy
**Options:** Rolling window (last N messages) | Token-counted trim | You decide
**Selected:** You decide
**Notes:** Claude picks best approach for model context window + simplicity.

### Q2: Conversation expiry
**Options:** 24h TTL (auto-expire) | Manual only (/reset) | Both
**Selected:** Other — "Fresh start at 5am each day"
**Notes:** User wants daily reset at 5am SGT, not TTL-based.

### Q3: SQLite schema depth
**Options:** Full messages | Minimal (context replay only) | You decide
**Selected:** Full messages
**Notes:** Store role, content, timestamp, token count per message.

### Q4: Reset announcement
**Options:** Silent fresh start | Brief indicator
**Selected:** Silent fresh start

### Q5: Manual clear variants
**Options:** Just /reset | /reset + /new | You decide
**Selected:** Just /reset

### Q6: Reset hour configurability
**Options:** Hardcoded 5am SGT | Env var RESET_HOUR_UTC | You decide
**Selected:** Env var RESET_HOUR_UTC (default 21 = 5am SGT)

### Q7: Old conversation handling
**Options:** Delete at reset | Soft delete (archive) | You decide
**Selected:** Soft delete (archive)

### Q8: Chunked message indicator
**Options:** No indicator | Part numbering | You decide
**Selected:** No indicator

## System Prompt

### Q1: Personality
**Options:** Minimal/neutral | Concise + direct | Custom persona
**Selected:** Concise + direct

### Q2: Context scope
**Options:** Minimal context | Full context | Progressive
**Selected:** Other — "Progressive, and have the context be stored as part of second brain in Obsidian"
**Notes:** Progressive prompt now, Obsidian-stored prompt in Phase 4. Deferred idea captured.

### Q3: Telegram awareness
**Options:** Telegram-aware | Generic assistant | You decide
**Selected:** Telegram-aware

### Q4: Date/time injection
**Options:** Yes, inject date/time | No, keep it static | You decide
**Selected:** Other — "You decide, but one of the functionality I hope to have is some CRON jobs..."
**Notes:** User mentioned reminder functionality. Deferred to Phase 7. Date/time injection decided as useful.

### Q5: HTML formatting approach
**Options:** Instruct Claude to use HTML | Let Claude use markdown, convert on send | You decide
**Selected:** You decide

### Q6: Extended thinking
**Options:** Always direct | Thinking for complex queries | You decide later
**Selected:** You decide later — deferred to model selection area.

## Status Command

### Q1: Display level
**Options:** Minimal (tokens today) | Detailed | Cost-focused
**Selected:** Minimal (tokens today)

### Q2: Token persistence
**Options:** Persist (cumulative) | Reset daily | You decide
**Selected:** Persist (cumulative)

### Q3: Conversation state info
**Options:** Yes, include conversation info | Tokens only | You decide
**Selected:** Yes, include conversation info

## Model Selection

### Q1: Default model
**Options:** Sonnet 4 (balanced) | Haiku 4.5 (fast + cheap) | Opus 4 (quality)
**Selected:** Haiku 4.5 (fast + cheap)

### Q2: Extended thinking
**Options:** No extended thinking (Phase 2) | Wire it now, disabled by default
**Selected:** Wire it now, disabled by default

### Q3: Model configurability
**Options:** Env var DEFAULT_MODEL | Hardcoded
**Selected:** Env var DEFAULT_MODEL

### Q4: Model router abstraction
**Options:** Minimal interface | Full provider pattern | You decide
**Selected:** You decide

### Q5: Streaming vs non-streaming
**Options:** Non-streaming | Streaming with progressive typing | You decide
**Selected:** Non-streaming

## Deferred Ideas

1. System prompt from Obsidian vault (Phase 4)
2. Reminder functionality — "remind me to do X at Y time" (Phase 7)
3. Extended thinking for complex queries (Phase 3)

---

*Discussion completed: 2026-05-06*
