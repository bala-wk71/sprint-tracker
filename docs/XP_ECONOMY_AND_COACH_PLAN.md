# XP Economy Reset + Coach Revamp

Date: 2026-09-16

Three pieces of work, in dependency order:

1. **Reset every user's XP to zero** (prod data change, announced to users).
2. **Fix the earn rules** so passive todo/notes use can't level anyone up, and
   **bleed XP** when someone stops tracking.
3. **Rebuild `/assistant`** as a multi-thread coach that pulls data on demand.

---

## Why the XP rate is wrong today

`lib/gamification.ts` awards XP per action with **no test for whether the day
was actually tracked**, and several awards have no daily ceiling:

| Award | Amount | Ceiling today |
|---|---|---|
| `todo_done` | 5 | **none** — once per task, unlimited tasks/day |
| `goal_step` | 15 | **none** — unlimited steps/day |
| `goal_checkin` | 10 | once per goal per week — 12 goals = 120 XP/week |
| `meal_logged` | 3 | bounded by meals |
| `sprint_created` | 20 | one per week in practice |

Level thresholds are `xpThreshold(n) = 75·(n-1)·n` — L2 at 150, L5 at 1500,
L6 at 2250. Ticking ~20 notes-page todos a day is 100 XP/day / 700 XP a week,
which reaches **level 6 in about three weeks with zero days tracked**. That is
the reported behaviour, exactly.

Nothing else is broken — `awardTimeLogXp` is already capped at 10 XP/day and
the ledger's dedupe keys already stop re-saves from double-awarding.

> **Note on precedent:** on 2026-07-19 weekly XP wagers were chosen
> *instead of* XP decay, on the stated principle that earned XP must never be
> clawed back. This plan reverses that decision deliberately. Wagers stay —
> they're opt-in upside; decay is the passive downside.

---

## Phase 1 — Reset every user to zero XP

**Migration:** `supabase/migrations/20260916000001_xp_reset.sql`

Insert one compensating negative row per user rather than deleting the ledger:

```sql
insert into public.xp_events (owner_id, amount, reason, dedupe_key)
select owner_id, -sum(amount), 'reset', 'reset:2026-09-16'
  from public.xp_events
 group by owner_id
having sum(amount) <> 0
on conflict (owner_id, dedupe_key) do nothing;
```

**Why compensating rows, not `delete from xp_events`:** the
`unique (owner_id, dedupe_key)` index *is* the idempotency mechanism. Wiping
the history would make every past action re-awardable — re-saving an old
evening wrap-up, re-ticking an old todo, and `awardTimeLogXp`'s prefix scan for
a day's prior accrual all rely on those rows still existing. Compensating rows
zero the total while keeping every past award un-re-earnable. It's also the
pattern already used for wager stakes, and it leaves an auditable trail.

`total_xp()` is a plain `sum(amount)`, so every surface (dashboard, sidebar
level chip, wager affordability) reads zero immediately with no code change.

**Also in this migration:**

- `delete from public.xp_wagers where status = 'active'` — an active wager's
  stake is escrowed as a negative row that the reset folds in. Leaving it would
  pay out stake + 50% on a stake that has already been zeroed.

**Deliberately untouched:** `user_achievements`, and every other table. Badges
record things people actually did; they stay unlocked. `level-5` / `level-10`
will read as unlocked while the level shows 1 — correct, they *did* reach it.

**One UI follow-up:** `components/dashboard/MascotOverlay.tsx:71` compares
`total_xp` against a localStorage `last-seen-xp` and would greet everyone with
"-1,240 XP since your last visit". Add a reset-aware branch that explains the
reset once instead.

**Deployment:** `supabase db push` is classifier-gated and needs explicit
approval per the project's workflow — I'll ask before running it.

---

## Phase 2 — Fix the earn rules

### The "tracked day" test

One definition, used in two places: gating XP, and stopping the bleed.

A date counts as tracked if **any** of these exist for that date:

- a `daily_logs` row with `morning_mood`, `morning_energy`, or `closing_mood` set
- a `journal_entries` row (`entry_date`)
- a `workouts` row (`log_date`)
- a `body_metrics` row (`measured_on`)
- a `meals` row (`log_date`) with `is_template = false`

Todos, notes, and sprint creation are **not** tracking.

New SQL function `public.day_is_tracked(d date)`, `auth.uid()`-scoped and
`stable`, plus a `tracked_dates` array added to `gamification_stats()` in a
`gamification_stats_v5` migration (extending the existing RPC rather than
adding per-widget queries, per the established pattern).

### Gated awards

Split `XP` into two groups in `lib/gamification.ts`:

- **Core (ungated)** — these *are* the act of tracking: `morning_checkin`,
  `evening_wrapup`, `perfect_day`, time logging, `journal_entry`,
  `workout_logged`, `weight_logged`, `water_goal`, `protein_goal`,
  `meal_logged`. Unchanged.
- **Effort (gated)** — pay out only on a tracked day: `todo_done`,
  `goal_step`, `goal_checkin`, `goal_done`, `sprint_created`.

`priority_done` needs no gate: priorities are inside the daily log, so
completing one already implies a wrap-up.

New `awardGatedXp()` wraps `awardXp()` and returns 0 when the day isn't
tracked. Untracked-day effort earns **nothing** — it is not banked and not
retroactively paid when the day is later logged. (Log the day first, then tick
things off; that's the behaviour we want to teach.)

### Daily ceilings

| Award | Was | Becomes |
|---|---|---|
| `todo_done` | 5, unlimited | **3**, max 5/day (15 XP/day) |
| `goal_step` | 15, unlimited | 15, max 2/day |
| `goal_checkin` | 10/goal/week | 10, max 3/day |

The todo cap counts that day's `todo_done` rows by `created_at`; per-task
dedupe stays, so unchecking and re-checking still can't farm.

**Net effect:** a notes-only day earns 0. A fully tracked day earns roughly
10 + 15 + 20 + 10 + 10 + ~15 ≈ 80–110 XP, so L5 is about three weeks of real
consistency — which is what the curve was designed for.

---

## Phase 3 — Bleed XP when tracking stops

**Rate (chosen):** 2 grace days per gap, then **-2% of current total per
untracked day, minimum 5 XP**. Floor 0. Compounds to roughly -45% after a month
away. Self-scaling — a veteran bleeds real points, a beginner barely notices.

**Mechanics** — `applyXpDecay()`, a server action called on dashboard mount
alongside the existing `resolveWagers()`:

- One negative ledger row per untracked day, dedupe key `decay:<date>` — so the
  unique index makes re-running it a no-op. Same append-only ledger, same shape
  as wager stakes.
- Walks from the later of (last decay row, first-ever tracked date, today−90)
  through **yesterday**. Today is never charged — matching the existing streak
  rule that today stays forgivable until it's over.
- Never runs before a user's first tracked day (new accounts don't bleed), and
  never charges days before the 2026-09-16 reset on first rollout.
- Running total is carried forward through the walk so percentages compound
  correctly and clamp at 0.

**Interaction with shields:** streak shields keep protecting the *streak*;
they don't absorb decay. Two separate mechanisms, two separate grace rules —
folding them together makes both harder to explain.

**Visibility** (this is what makes it fair rather than punitive):

- Dashboard warning before it starts: *"Nothing tracked since 14 Sep — XP
  starts bleeding tomorrow."*
- After the fact: *"-42 XP from 3 untracked days."*
- Mascot announces the drop on return, alongside the existing XP-delta line.

---

## Phase 4 — Assistant: threads

**Migration:** `supabase/migrations/20260916000002_ai_threads.sql`

- drop the `unique` on `ai_conversations.user_id`
- add `title text not null default 'New chat'`, `last_message_at timestamptz`,
  `archived_at timestamptz`
- add `ai_messages.tool_calls jsonb` (what the coach read, for the UI chips)
- index `(user_id, last_message_at desc)`
- backfill each existing conversation's title from its first user message

**UI** — `app/(app)/assistant/`:

```
+--------------+--------------------------------+
| + New chat   |  Why is my energy low?   [You] |
|--------------|                                |
| Energy dip   |  You logged 4.1h Mon vs 7.2h   |
| Q3 goals     |  last Mon, and slept...        |
| Week review  |  > read: 12-16 Sep logs,       |
| Health plan  |  >       3 workouts, sleep     |
|              |--------------------------------|
| Rational v   |  Ask your coach...        [->] |
+--------------+--------------------------------+
```

- `ThreadRail.tsx` — new/rename/delete, relative timestamps, active highlight;
  drawer on mobile, persona selector docked at its foot (off the page header,
  where it currently competes with the title).
- `ChatPane.tsx` — streaming render, tool chips, tighter bubbles.
- Auto-title from the first exchange via a cheap `generateJson` call.
- "Ask the coach" entry points on `/daily`, `/goals/[id]` and the dashboard
  week card, each seeding a new thread with that subject.

---

## Phase 5 — Assistant: on-demand knowledge

Today `app/api/ai/chat/route.ts` rebuilds a fixed snapshot — current sprint,
last sprint, today's log, 14 days of logs, health, goals — and stuffs it into
the system prompt on **every single turn**. It's expensive, and still shallow:
ask about last quarter and the data simply isn't there.

Replace with a small always-on briefing plus **Gemini function calling**:

**Briefing (~500 tokens, every turn):** today's date, week start, whether today
is tracked, streak, level/XP, active goal titles, current sprint headline.

**Tools the coach can call**, each backed by an existing gatherer in `lib/ai/`:

| Tool | Backed by |
|---|---|
| `get_days(from, to)` | `context.ts` daily-log gatherers |
| `get_week(week_start)` | `gatherWeeklyContext` |
| `get_health(from, to, kind)` | `healthContext.ts`, generalised to a range |
| `get_goals()` / `get_goal(id)` | `lib/ai/goals.ts` |
| `search_journal(query, from, to)` | journal — **only declared when `users.coach_reads_journal` is true** |
| `get_todos(status)` / `search_notes(query)` | `lib/ai/notes.ts` |
| `get_progress()` | XP, level, streak, achievements, decay state |

- Max 4 tool hops per turn; each result size-capped.
- `gemini.ts` gains `streamGenerateContent?alt=sse` support and a tool loop,
  keeping the existing model-fallback and 429/503 retry chain. Streaming runs
  fine on the default Node runtime — no edge runtime needed.
- Which tools ran is persisted to `ai_messages.tool_calls` and rendered as
  "read: …" chips under each answer. Grounding you can see.
- The existing 50-message/100k-char compaction stays, now per thread.

`get_progress()` also means the coach can explain the new XP rules and warn
about an impending bleed in conversation.

**Rate limits:** free-tier Gemini is ~15 RPM and a tool loop costs 2–5 calls
per turn. The 4-hop cap plus the existing `gemini-2.5-flash` →
`gemini-2.5-flash-lite` fallback keeps this inside the budget for a single
active user; worth watching if the user base grows.

---

## Order of work

1. Phase 1 migration + mascot copy → **ask before `supabase db push`**
2. Phase 2 earn rules (`day_is_tracked`, gating, caps)
3. Phase 3 decay + dashboard warnings
4. Phase 4 thread schema + UI
5. Phase 5 streaming + tool calling

Commit after each, per project convention. Phases 2–3 ship as code and are
verifiable on localhost; Phases 1, 4, 5 touch prod DB or Gemini and need
production verification (`GEMINI_API_KEY` is empty in `.env.local`).
