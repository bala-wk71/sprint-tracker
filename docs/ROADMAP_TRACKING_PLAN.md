# Roadmap Tracking Plan

## What this is

A user writes a long-range plan in Markdown (their life roadmap: money, health,
career, family, over months to years). They upload it. The app splits it into
things it can track, lays out where the plan says they *should* be on every
date, and compares that against where they *actually* are, using data the app
already collects wherever possible.

The unit is a **Roadmap**. Goals, sprints and todos already cover "what am I
doing this week / this quarter". A roadmap sits above them and answers
"am I on the path I drew for myself?"

Blank template for users: [`docs/templates/ROADMAP_TEMPLATE.md`](templates/ROADMAP_TEMPLATE.md).

---

## 1. What a roadmap actually contains

Reading a real roadmap (age 24 → 32, money + health) shows eight kinds of
content. Each maps to a different tracking behaviour:

| # | Block | Example from the real file | What the app does with it |
|---|---|---|---|
| 1 | **Baseline** | "Weight 95 kg", "Savings ₹1 lakh", "Balance −₹9,000/month" | Seeds the first reading of each metric, dated the plan's start |
| 2 | **Target path** | Weight: 95 → 89–90 (end 2026) → 82–85 (mid-2027) → 80–83 held (age 32) | A metric with dated checkpoints; the app draws the expected band between them |
| 3 | **Habit band** | "2,100–2,400 kcal/day", "3–4 strength days/week", "7–8 h sleep" | A metric whose target is a constant band, measured over a rolling window |
| 4 | **Dated checklist** | "Next week (by Sep 27)", "By end of 2026" | A `steps` goal with a target date, one step per checkbox |
| 5 | **Year-by-year milestones** | "2027: bike loan ends ~Oct", "2030: quit IT, buy Hayabusa" | Checkpoint values for metrics mentioned in the year + dated milestone steps |
| 6 | **Decision gates** | "Quit IT only when all four are true" | A named rule made of conditions; each condition is a metric test or a manual tick |
| 7 | **Tracking cadence** | Weekly: weight, workouts. Monthly: waist, profit. January: insurance, blood work | Sets how often each metric asks for a reading; yearly items become a recurring checklist |
| 8 | **Reference / rationale** | Eye-emergency signs, spending priority, disclaimers, "the bigger dream" | Kept verbatim as notes on the roadmap, not tracked |

Anything the importer can't place goes into block 8, so nothing in the file is lost.

---

## 2. Onboarding the Markdown

### Recommendation: AI extraction plus a review screen, guided by a template

Three ways to go, in order of how strict the format is:

1. **Strict structured format** (YAML or fenced data blocks). Parses reliably,
   but nobody writes a life plan in YAML, and the example file
   would need rewriting.
2. **Free-form Markdown → AI → save.** Accepts anything, but a wrong "₹15 Cr"
   vs "₹1.5 Cr" would go in without anyone seeing it.
3. **Free-form Markdown → AI draft → user reviews → save.** ✅

Option 3 is the same pattern as the food logger (`app/(app)/health/eat/ai.ts` →
`DraftEditor.tsx`): Gemini `generateJson` with a response schema produces a
draft, and the user fixes it before anything is written. The template raises
extraction quality but is **not required**: the example file, written with no
template, must import cleanly. It is the acceptance test.

### Import flow

```
Upload / paste .md
      │
      ▼
Gemini generateJson (schema below)  ──►  Draft: metrics, checkpoints, checklists,
      │                                      gates, cadence, notes, "unplaced" text
      ▼
Review screen (nothing saved yet)
  • Metrics: name, unit, direction, data source, checkpoints (editable table)
  • Checklists & milestones: grouped by date
  • Gates: conditions, each linked to a metric or marked manual
  • Notes: everything else, with any text the importer couldn't place highlighted
      │
      ▼
Save  ──►  roadmap + metrics + targets + goals/steps + gates in one transaction
```

### Things the extractor must handle (all appear in the example)

- **Relative dates**: "End of 2026" → 2026-12-31, "Mid-2027" → 2027-06-30,
  "Age 32" → needs a birth year or "Age 24 in 2026" anchor (the template asks
  for it up front), "around October" → 2027-10-31 and flagged approximate.
- **Ranges and bounds**: "89–90 kg" (min/max), "Under 94 cm" (max only),
  "₹50,000+" (min only), "80–83 kg, held steady" (band that stays).
- **Relative targets**: "Down 2–3%" body fat or "Down 4–5 cm" waist, where the
  baseline says "*To measure*". Store as relative-to-baseline and resolve on
  the first reading. Until then the metric shows **"Needs a first measurement"**.
- **Indian number words**: ₹1.4 lakh = 140,000; ₹15 Cr = 150,000,000. Store
  base units (rupees) and format back as lakh/Cr for display.
- **Non-numeric targets**: "runs 10K comfortably", "plays football with my
  kids" become milestone steps, not metrics.
- **Branching outcomes**: "₹5–10 Cr revenue *or* wound down by 28" becomes a
  gate/decision, not a single target line.
- **Scenarios**: "aggressive" (base) vs "maxxed" (stretch). Phase 3; for now
  import the base scenario and keep the other as a note.

---

## 3. The example, mapped

This is what a correct import of the example roadmap looks like. It doubles as
the test fixture.

### Metrics

| Metric | Unit | Better | Source | Check | Checkpoints |
|---|---|---|---|---|---|
| Weight | kg | down, then hold | `body_metrics.weight_kg` (auto) | weekly | 95 (now) → 89–90 (2026-12-31) → 82–85 (2027-06-30) → hold 80–83 (to 2034-09-30) |
| Body fat | % | down | `body_metrics.body_fat_pct` (auto) | monthly | ? → start −2–3 (2026-12-31) → 18–20 (2027-06-30) → 15–18 (2032, 2034) |
| Waist | cm | down | `body_metrics.waist_cm` (auto) | monthly | ? → start −4–5 (2026-12-31) → <94 (2027-06-30) → <90 (2034) |
| Strength sessions | /week | band | `workouts` count (auto) | weekly | 3–4 constant |
| Calories | kcal/day | band | `meals` avg over 7 days (auto) | weekly | 2,100–2,400 constant |
| Protein | g/day | band | `meals` avg over 7 days (auto) | weekly | 130–160 constant |
| Monthly cash balance | ₹/month | up | manual | monthly | −9,000 → ≥0 (2026-12-31) |
| Company profit | ₹/month | up, compounding | manual | monthly | 1 L (2026) → 1.4 L (2027) → 2 L → 2.7 L → 3.8 L → 5.4 L → 7.5 L → 10.5 L → 15 L (2034) |
| Emergency fund | ₹ | up | manual | monthly | 1 L → 2.5 L (2027) → 4 L (2028) → 6 months of expenses |
| Personal loan left | ₹ | down to 0 | computed: ₹49k EMI, 36 months left | monthly | → 0 (2029-09-30) |
| Bike loan left | ₹ | down to 0 | computed: ₹13k EMI, 13 months left | monthly | → 0 (2027-10-31) |
| Personal investments | ₹ | up | manual | yearly | → 75 L–1.5 Cr (2034-09-30) |

Six health metrics fill in from data the app already collects (four in Phase 1,
workouts and meals in Phase 2). The loans compute themselves from the EMI
schedule, and a typed balance overrides the schedule after a prepayment. The
rest are one number typed in weekly or monthly.

### Levers (what moves each metric, see §6)

| Outcome | Levers | Source |
|---|---|---|
| Weight, waist, body fat | 3–4 strength sessions/week · protein 130 g+ on 5 of 7 days · calories in range on 5 of 7 days · a 30-min walk or run on 3+ days (the file's "8,000 steps") | workouts, meals (auto) · walk: tick |
| Company profit | Hours on company work each week · sales conversations each week | sprint tasks linked to the roadmap (auto) · tick |
| Monthly cash balance, emergency fund | Monthly transfer to the emergency fund made · credit card paid in full | tick |
| Drone startup | Hours on startup work each week · leads contacted | linked tasks (auto) · tick |
| Running ladder | Runs this week | workouts with a Running set (auto) |

### Checklists (→ `goals` with `track_type = 'steps'`)

- **Next week** (due 2026-09-27): 6 money/work steps and 5 health steps
- **By end of 2026** (due 2026-12-31): 6 money/work and 6 health steps
- **Running ladder**: walk-run 3 km (2026-12-31) → 5K under 30 min
  (2027-06-30) → 10K comfortably (2028-12-31)
- **Life milestones** (one step each, dated): bike loan cleared, startup
  decision, personal loan cleared, marriage window, quit IT + Hayabusa, first
  child, dream land, second child, home build, move in

### Gates

**Quit the IT job**: all of:
1. Company profit ≥ ₹3.5 L **for 6 consecutive months** (metric, sustained)
2. Personal loan left = 0 **or** "company pays the EMI" ticked (metric OR manual)
3. Emergency fund ≥ 6 × monthly expenses (metric vs metric)
4. Orders booked ≥ 6 months ahead (manual tick)

**Startup decision (2028)**: repeat paying customers or funding (manual).
**Big dream unlocks**: company profit ≥ ₹3 Cr/year (metric).

### Recurring checks

- **Weekly**: weight, workouts, steps, spending vs budget
- **Monthly**: waist, company profit, credit card paid in full (tick)
- **Every January**: profit vs target, emergency fund, insurance active,
  debt only going down, blood work + BP + body fat + dilated eye exam

### Rules the app can check itself

- *Weight stalled 4+ weeks* → prompt: "Review food and sleep before cutting further"
- *Beat the year's target* → suggest pulling the next checkpoints forward a year
- *Missed two years in a row* → suggest slowing big spending and revisiting the plan

---

## 4. Data model

New tables, all owner-only RLS by default (money figures are sensitive).
Reviewers see nothing until the owner shares an area (Phase 3). One active
roadmap per user; importing a new one archives the old.

```sql
-- The uploaded plan. source_md is kept so it can be re-parsed or diffed later.
create table public.roadmaps (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.users(id) on delete cascade,
  title       text not null,
  source_md   text not null,
  start_date  date not null,
  end_date    date not null,
  birth_date  date,              -- resolves "Age 32"; falls back to health_profiles.birth_date
  notes_md    text not null default '',   -- block 8: kept, not tracked
  status      text not null default 'active' check (status in ('active', 'archived')),
  shared_areas text[] not null default '{}',  -- reviewer sees only these areas; empty = private
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index roadmaps_one_active
  on public.roadmaps (owner_id) where status = 'active';

-- One trackable number. `source` decides where actual values come from.
create table public.roadmap_metrics (
  id           uuid primary key default gen_random_uuid(),
  roadmap_id   uuid not null references public.roadmaps(id) on delete cascade,
  owner_id     uuid not null references public.users(id) on delete cascade,
  key          text not null,        -- stable slug ("weight", "company_profit"); survives re-import
  label        text not null,
  area         text not null,        -- reuses GOAL_AREA_VALUES
  unit         text not null,        -- "kg", "%", "cm", "inr", "inr_month", "steps", "per_week"
  direction    text not null check (direction in ('down', 'up', 'band')),
  interpolate  text not null default 'linear' check (interpolate in ('linear', 'compound', 'step')),
  source       text not null default 'manual',
    -- 'manual' | 'body.weight_kg' | 'body.body_fat_pct' | 'body.waist_cm'
    -- | 'workouts.per_week' | 'meals.kcal_avg7' | 'meals.protein_avg7'
    -- | 'loan_schedule'
  source_params jsonb not null default '{}',  -- loan_schedule: { "emi": 49000, "last_emi_on": "2029-09-05" }
  cadence      text not null default 'monthly' check (cadence in ('weekly', 'monthly', 'yearly')),
  position     integer not null default 0,
  unique (roadmap_id, key)
);

-- Where the plan says the metric should be on a date. Min/max both optional:
-- "under 94" is max only, "50,000+" is min only, "89–90" is both.
create table public.roadmap_targets (
  id           uuid primary key default gen_random_uuid(),
  metric_id    uuid not null references public.roadmap_metrics(id) on delete cascade,
  owner_id     uuid not null references public.users(id) on delete cascade,
  target_date  date not null,
  label        text,                 -- "End of 2026", "Age 32": what the user wrote
  min_value    numeric,
  max_value    numeric,
  relative     boolean not null default false,  -- values are deltas from the baseline reading
  hold_until   date,                 -- "held steady": band continues flat to this date
  approximate  boolean not null default false,  -- "around October"
  check (min_value is not null or max_value is not null)
);

-- Actual values for manual metrics. Auto metrics read their source tables and
-- never write here, so there is one source of truth per number.
create table public.roadmap_readings (
  id           uuid primary key default gen_random_uuid(),
  metric_id    uuid not null references public.roadmap_metrics(id) on delete cascade,
  owner_id     uuid not null references public.users(id) on delete cascade,
  measured_on  date not null,
  value        numeric not null,
  note         text,
  unique (metric_id, measured_on)
);

-- Decision rules. Conditions are jsonb so gates can grow without migrations:
-- [{ "metric": "company_profit", "op": ">=", "value": 350000, "sustained_months": 6 },
--  { "any": [{ "metric": "personal_loan", "op": "<=", "value": 0 },
--            { "manual": "Company is paying the EMI" }] },
--  { "metric": "emergency_fund", "op": ">=", "times": 6, "of_metric": "monthly_expenses" },
--  { "manual": "Orders booked 6 months ahead" }]
create table public.roadmap_gates (
  id           uuid primary key default gen_random_uuid(),
  roadmap_id   uuid not null references public.roadmaps(id) on delete cascade,
  owner_id     uuid not null references public.users(id) on delete cascade,
  title        text not null,
  conditions   jsonb not null,
  manual_ticks jsonb not null default '{}',   -- { "Orders booked 6 months ahead": "2030-02-01" }
  met_on       date
);

-- Checklists and milestones reuse goals + goal_steps.
alter table public.goals
  add column roadmap_id uuid references public.roadmaps(id) on delete set null;

-- Levers: the actions you control that move an outcome (§6). This is where
-- daily and weekly progress comes from.
create table public.roadmap_levers (
  id           uuid primary key default gen_random_uuid(),
  roadmap_id   uuid not null references public.roadmaps(id) on delete cascade,
  owner_id     uuid not null references public.users(id) on delete cascade,
  metric_id    uuid references public.roadmap_metrics(id) on delete set null,  -- null = area-level
  area         text not null,
  title        text not null,          -- "Strength session", "Protein 130 g+"
  source       text not null default 'tick',
    -- 'tick' | 'workouts.strength' | 'workouts.running' | 'meals.protein_min'
    -- | 'meals.kcal_band' | 'linked_hours'
  source_params jsonb not null default '{}',   -- { "min": 130 } / { "min": 2100, "max": 2400 }
  period       text not null check (period in ('day', 'week', 'month')),
  target       numeric not null,       -- per period: 4 sessions/week, 5 days/week, 1/month
  position     integer not null default 0
);

-- Manual lever ticks. Auto levers read workouts/meals/time entries directly.
create table public.roadmap_lever_ticks (
  lever_id  uuid not null references public.roadmap_levers(id) on delete cascade,
  owner_id  uuid not null references public.users(id) on delete cascade,
  done_on   date not null,
  count     numeric not null default 1,   -- "3 sales calls" in one tick
  primary key (lever_id, done_on)
);
```

Why checklists reuse `goals` instead of a new table: goals already have
steps, target dates, check-ins, reviewer comments, links to sprint tasks and
todos, and the coach's goal review. A "By end of 2026" checklist is exactly a
steps goal. A roadmap goal can then link to this week's sprint tasks, which
is how the long view reaches daily work.

Yearly recurring checks ("every January") become a steps goal that re-opens
each January (a small `recurs` column on goals, or re-created by a cron job:
decide in Phase 2).

---

## 5. Projected vs actual

Lives in `lib/roadmap/projection.ts`. Pure functions, no DB, so it is easy to unit test
against the example fixture.

**Expected band on date _d_**
1. Anchor at `(start_date, baseline)`. The baseline is the first reading, or the
   "now" value from the file.
2. Find the checkpoints before and after _d_, and interpolate `min` and `max` separately:
   - `linear`: straight line (weight, waist)
   - `compound`: geometric, `a · (b/a)^t` (company profit growing 40%/yr).
     Straight lines would demand too much early and too little late.
   - `step`: the value jumps on the date (loan balance to 0)
3. After a checkpoint with `hold_until`, the band stays flat.
4. A missing bound means open-ended: "under 94" has no floor.
5. A `relative` target needs a baseline reading first. Until one exists the
   metric has no band and shows **"Needs a first measurement"**.

**Actual value on date _d_**
- `manual`: latest reading on or before _d_
- `body.*`: latest `body_metrics` row on or before _d_. Weight uses a 7-day
  average so one salty dinner doesn't flip the status.
- `workouts.per_week` / `meals.*_avg7`: aggregate over the trailing window

**Status**, direction-aware, same vocabulary as `lib/pace.ts`:
- `down`: below band = **ahead**, inside = **on track**, above = **behind**
- `up`: mirrored
- `band`: inside = **on track**, outside either way = **off band**
- No reading within 2× the cadence = **stale** ("last weighed 19 days ago")

These are internal values. The UI never shows the word "behind": see §6 for
how each status is worded.

**Gate evaluation**: `sustained_months` looks at month-end values for the
last N months. The gate is met when every condition is true. `met_on` is stored
the first time, so the app can say "you met the quit trigger in March".

---

## 6. Progress you can feel (daily, weekly, monthly)

The problem: an 8-year plan barely moves day to day. Weight drifts a few
hundred grams, profit gets checked once a month, and most milestones are years
away. With only outcome metrics, the page says "no change" most days and
"behind" on bad weeks. That is demoralising, and the user stops opening it
(that is how the app was abandoned once before; see the gamification history).

The fix is two layers of progress. The **inputs** you control show up every
day. The **distance covered** only ever grows.

### 6.1 Levers: progress you make today

Every outcome gets 1–4 **levers**: actions in your control that move it,
even indirectly. Hitting a lever *is* progress, whatever the scale says today.

- Imported from the file where it says so ("Daily habits", "Every week")
- Where an outcome has none, the importer suggests some (company profit ←
  "hours on company work", "sales conversations") and the user confirms or
  edits them on the review screen
- Filled automatically wherever possible: workouts, meals, and hours on
  sprint tasks and todos linked to a roadmap goal (the existing goal links).
  Only the rest are one-tap ticks.

A lever is measured per period (a day, week or month), never as a streak, so
one missed day costs nothing on its own.

### 6.2 Five time scales, each with its own bar

| Scale | Question it answers | What fills it |
|---|---|---|
| **Today** | "Did I move the plan today?" | Levers done today, e.g. *Protein ✓ · Walk ✓ · Workout: not yet* |
| **This week** | "Was this a solid week?" | Share of weekly lever targets met. **70% or more = a solid week** (not 100%) |
| **This month** | "Where am I really?" | The monthly check-in: log manual values, see outcomes move |
| **This chapter** | "How's 2026 going?" | Checkpoints hit plus checklist steps done for the current year |
| **The journey** | "How far have I come since I started?" | Distance covered across all outcomes and milestones |

There is always a bar close enough to fill. On any given day it's the Today
strip, even when the journey bar hasn't visibly moved in a month.

### 6.3 The journey bar only goes up

- **Outcomes count their best reading, not their latest.** 95 → 88.9 kg is 6.1 kg
  covered and stays covered. If you bounce back to 89.6, the card shows *"Best
  88.9 · now 89.6"*, but the journey bar keeps the 6.1 kg.
- **Milestones and checklist steps** add distance once and never take it away.
- **Journey %** = average across areas of (distance covered ÷ distance planned).
  Each area is the average of its outcomes and its milestone share. The full
  formula lives in `lib/roadmap/progress.ts`.

This is deliberately different from XP. Since 2026-09-16 **XP decays** so that it
tracks *recent* effort, and that's the right number for "am I showing up?".
The journey bar answers "how far have I come?" and must never go backwards.
Keeping the two separate lets both be honest.

### 6.4 Wording rules (motivating, not depressing)

| Instead of | Say |
|---|---|
| "9.4 kg to go" | "6.1 kg down · 58% of the way to 82–85" |
| "Behind" (red) | "**Catching up**" (amber), plus the way back: *"3 more solid weeks puts you back in range by 15 Dec"* |
| "Missed 2 workouts" | "2 of 4 workouts: 2 more this week makes it a solid week" |
| "0% this month" on a noisy metric | Trend over 4 weeks, weight on a 7-day average |
| "Stale" | "Time for a weigh-in: last one 19 days ago" |
| Nothing when on track | Celebrate: first reading, checkpoint hit, new best, 4 solid weeks in a row, a gate condition met |

When something is catching up, the card always names **one concrete next
action** (a lever), never only the size of the gap.

### 6.5 Tie-ins with XP and achievements

These reuse `awardTrackedXp`, so they only pay out on tracked days and are
capped per day. Each has a dedupe key:
- Solid week: `roadmap_week:<week_start>`
- Checkpoint hit: `roadmap_checkpoint:<target_id>`
- New best on an outcome: `roadmap_best:<metric_id>:<yyyy-mm>`. At most one per
  metric per month, so weigh-in noise can't be farmed.
- Roadmap steps already earn the `goal_step` XP (they are goal steps)

New achievement ladders: solid weeks in a row (4 → 52), checkpoints hit,
journey % milestones (10 / 25 / 50 / 75 / 100).

---

## 7. Screens

Roadmaps join the existing Plan tabs: **This week · Goals · Roadmap**.

0. **Dashboard strip**: "Roadmap today" with today's levers (auto ones already
   ticked), this week's solid-week bar, and the journey %. It sits next to the
   existing Today card and is the thing seen every day.

1. **`/roadmap/import`**: paste or upload `.md` → "Reading your plan…" → review
   screen (§2). A "Download blank template" link sits above the box.
2. **`/roadmap/[id]`**: the main view
   - **Header**: title, journey bar ("12% of the way · year 1 of 8"), chapter
     bar ("2026 chapter: 40%"), pill: *7 on track · 2 catching up · 3 need a reading*
   - **Metric cards** grouped by area: small Recharts chart with the expected
     band shaded, the actual line on top, checkpoint dots labelled "End of
     2026". One line underneath: *"6.1 kg down: on track for 89–90 by 31 Dec."*
     Under that, the card's levers for this week. Manual metrics have an
     inline "Log value" button.
   - **Timeline**: horizontal years 2026 → 2034, milestones and checkpoints on
     it, today marked, past items green or red
   - **Gates**: each condition with ✓/✗ and its current value ("Profit ≥ ₹3.5 L
     for 6 months: 2 of 6")
   - **Notes**: the reference text from the file, collapsed
3. **Check-in prompts**: the dashboard's existing "check-in due" area shows
   "Log company profit for September" when a monthly manual metric is due. Auto
   metrics never prompt.
4. **Coach**: a new tool in `lib/ai/tools.ts`, `get_roadmap_status`, that returns
   the same projection output, so "am I on track for 2027?" gets real numbers.
   The coach's January review reads the gates and yearly checklist.

---

## 8. Phases

**Phase 1: import, compare, and see progress** (the core loop)
- Migration: `roadmaps`, `roadmap_metrics`, `roadmap_targets`, `roadmap_readings`,
  `roadmap_levers`, `roadmap_lever_ticks`, `goals.roadmap_id`
- `lib/roadmap/extract.ts`: Gemini schema and prompt, plus lakh/crore and date
  normalisation; suggests levers for outcomes that have none
- `lib/roadmap/projection.ts` (expected band, status) and `lib/roadmap/progress.ts`
  (journey %, chapter %, solid week), with tests against the example fixture
- Import + review screen; roadmap page with metric cards, levers, checklists
- Dashboard "Roadmap today" strip
- Auto sources: weight, waist, body fat, loan schedule. Levers: workouts,
  meals, linked hours; everything else a tick.

**Phase 2: make it run itself**
- Gates + evaluation
- Workouts and meals as outcome sources
- Due-reading prompts on the dashboard; yearly recurring checklist
- "Catching up" recovery lines; stall / beat / miss rules
- XP + achievement tie-ins (§6.5); coach tool

**Phase 3: living plan**
- Re-import an edited `.md`: diff by metric `key`, keep readings, show
  what changed before applying
- Plan versions: when targets move, keep the old ones so history is still
  judged against the plan as it was ("rebaselined Jan 2028: moved forward a year")
- Scenarios: base + stretch lines on the same chart
- Cash-flow block: budget lines with end dates (bike EMI ends Oct 2027)
  project the monthly balance automatically
- Reviewer sharing, per area (share health, keep money private)

---

## 9. Decisions (2026-09-19)

1. **One active roadmap per user.** Importing a new one archives the old
   (enforced by a partial unique index).
2. **Private by default.** Reviewers see a roadmap area only after the owner
   shares it (`shared_areas`).
3. **Loans are computed** from EMI + last EMI date; a typed balance overrides
   the schedule from its date on (prepayments).
4. **"Daily steps" means daily progress, not a step counter.** Progress comes
   from levers every day, a solid-week bar every week, and a journey bar that
   only goes up (§6). The file's literal "8,000 steps a day" becomes a
   walk/run lever you tick. No step counter needed.
