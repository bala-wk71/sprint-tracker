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
- **Scenarios**: "aggressive" (base) vs "maxxed" (stretch). Phase 4; for now
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
workouts and meals in Phase 3). The loans compute themselves from the EMI
schedule, and a typed balance overrides the schedule after a prepayment. The
rest are one number typed in weekly or monthly.

### Streams (every front of life, see §7)

Eight fronts run at once (the file covers six; Learning and Daily life come from the user). Each becomes a **stream** with its own
outcomes, levers (§6), milestones and weekly hours:

| Stream | Outcomes | Levers (weekly unless noted) | Milestones & gates |
|---|---|---|---|
| **IT job** | Salary (₹79k/month) | Hours on job-switch prep (resume, interviews, skills) | Resume updated (by Sep 27) · switch for a better salary (2027) · **quit gate** (2030) |
| **Dad's company** | Monthly profit (₹1 L → ₹15 L) | Hours on company work · sales conversations · target-customer list growing | 20 target customers (end 2026) · 3 months of orders before the move (Apr 2027) · company starts paying the EMI (2028) · written ownership share · full-time + Hayabusa (2030) · second shift (2031) |
| **Drone startup** | Revenue, paying customers | Hours on startup work · leads contacted | Founders' agreement signed · DPIIT + grants · first order delivered with testimonial · 2–3 leads (end 2026) · grant/seed or ₹25–50 L revenue (2027) · **continue-or-wind-down gate** (2028) |
| **Health** | Weight, waist, body fat, running ladder | Strength 3–4 · protein 130 g+ on 5 days · calories in range on 5 days · walk/run 30 min on 3+ days (the file's "8,000 steps") · sleep 7–8 h | Blood test + eye exam (by Sep 27, then yearly) · walk-run 3 km → 5K < 30 min → 10K |
| **Money** | Monthly balance, emergency fund, loans (computed), investments | Emergency-fund transfer (monthly) · card paid in full (monthly) · SIP running (monthly) | Term plan + parents' insurance (end 2026) · bike loan cleared (Oct 2027) · debt-free (Sep 2029) · ₹50k+/month invested (2030) |
| **Family & home** | *(milestones only)* | *(none in file: importer suggests e.g. family time, optional)* | Parents insured · marriage window (2029) · first child + education SIP (2031) · land near Pollachi (2032) · second child, home build (2033) · move in (2034) |
| **Learning** | *(nothing in the file)* | *(importer asks: "Learning has no targets yet. Add one?")* | — |
| **Daily life** | Days tracked per week, mood/energy trend | Morning check-in + evening wrap-up (existing daily log) | — |

Health, Daily life and the loans fill in from data the app already has; so do
the hours levers, via sprint tasks and todos linked to a stream (§7.2). The
rest are one-tap ticks or one number a month.

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
Reviewers see nothing until the owner shares an area (Phase 4). One active
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

-- A front of life: "IT job", "Dad's company", "Health". Everything below
-- (metrics, levers, gates, goals) belongs to one stream. See §7.
create table public.roadmap_streams (
  id            uuid primary key default gen_random_uuid(),
  roadmap_id    uuid not null references public.roadmaps(id) on delete cascade,
  owner_id      uuid not null references public.users(id) on delete cascade,
  name          text not null,
  area          text not null,            -- GOAL_AREA_VALUES: colour + reviewer sharing
  weight        numeric not null default 1 check (weight >= 0),  -- share of the weekly score
  weekly_hours  numeric,                  -- planned hours per week; null = not time-boxed
  -- Auto-created goal ("Dad's company: ongoing work") so any sprint task or todo
  -- can link to the stream without first inventing a milestone.
  ongoing_goal_id uuid references public.goals(id) on delete set null,
  position      integer not null default 0,
  unique (roadmap_id, name)
);

-- A rough patch: illness, a job crunch, a wedding, exams. While it lasts, the
-- stream's weekly targets drop to their floors and effort checkpoints shift.
create table public.roadmap_hurdles (
  id          uuid primary key default gen_random_uuid(),
  roadmap_id  uuid not null references public.roadmaps(id) on delete cascade,
  owner_id    uuid not null references public.users(id) on delete cascade,
  stream_id   uuid references public.roadmap_streams(id) on delete cascade,  -- null = every stream
  reason      text not null,
  starts_on   date not null,
  ends_on     date,                        -- null = ongoing until "I'm back"
  check (ends_on is null or ends_on >= starts_on)
);

-- One trackable number. `source` decides where actual values come from.
create table public.roadmap_metrics (
  id           uuid primary key default gen_random_uuid(),
  roadmap_id   uuid not null references public.roadmaps(id) on delete cascade,
  owner_id     uuid not null references public.users(id) on delete cascade,
  stream_id    uuid not null references public.roadmap_streams(id) on delete cascade,
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
  -- 'effort' checkpoints (weight, profit) shift when a hurdle pauses the
  -- stream; 'calendar' ones (last EMI, age-based events) never move.
  kind         text not null default 'effort' check (kind in ('effort', 'calendar')),
  shifted_days integer not null default 0,     -- total hurdle shift applied, for the audit line
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
  stream_id    uuid references public.roadmap_streams(id) on delete set null,
  title        text not null,
  conditions   jsonb not null,
  manual_ticks jsonb not null default '{}',   -- { "Orders booked 6 months ahead": "2030-02-01" }
  met_on       date
);

-- Checklists and milestones reuse goals + goal_steps.
alter table public.goals
  add column roadmap_id uuid references public.roadmaps(id) on delete set null,
  add column stream_id  uuid references public.roadmap_streams(id) on delete set null;

-- Levers: the actions you control that move an outcome (§6). This is where
-- daily and weekly progress comes from.
create table public.roadmap_levers (
  id           uuid primary key default gen_random_uuid(),
  roadmap_id   uuid not null references public.roadmaps(id) on delete cascade,
  owner_id     uuid not null references public.users(id) on delete cascade,
  stream_id    uuid not null references public.roadmap_streams(id) on delete cascade,
  metric_id    uuid references public.roadmap_metrics(id) on delete set null,  -- null = stream-level
  title        text not null,          -- "Strength session", "Protein 130 g+"
  source       text not null default 'tick',
    -- 'tick' | 'workouts.strength' | 'workouts.running' | 'meals.protein_min'
    -- | 'meals.kcal_band' | 'linked_hours' | 'daily_log.tracked_days'
  source_params jsonb not null default '{}',   -- { "min": 130 } / { "min": 2100, "max": 2400 }
  period       text not null check (period in ('day', 'week', 'month')),
  target       numeric not null,       -- per period: 4 sessions/week, 5 days/week, 1/month
  floor        numeric not null,       -- the minimum that still counts in a hard week; default ceil(target / 2)
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
decide in Phase 3).

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
| **This week** | "Was this a solid week?" | The **week score** across every stream (§7.3). **70 or more = a solid week** (not 100) |
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
- **Journey %** = weighted average across streams (stream `weight`) of each
  stream's distance covered ÷ distance planned. A stream's figure is the average
  of its outcomes' best distance and its milestone share. Streams with no
  outcomes (Family) count milestones only. The full formula lives in
  `lib/roadmap/progress.ts`.

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

## 7. The whole life in one score, built to survive hurdles

An IT job, a family business, a startup, health, money, family and learning all
run at once and compete for the same ~110 waking hours a week. Something will
always be slipping: a release crunch at the IT job, a big order at the
workshop, a fever, a wedding. The plan has to expect that. **A hard stretch
should cost pace, never progress,** and the numbers should show you getting
better even in a year when you're not on the original schedule.

### 7.1 Streams

Each front is a stream (§3 has the example mapped). A stream has:
- **Outcomes**: the slow numbers (profit, weight, emergency fund)
- **Levers**: weekly actions, each with a **target** and a **floor** (the
  minimum that still counts in a hard week, e.g. strength 4 / floor 2)
- **Milestones**: checklist goals and dated steps
- **A weight**: its share of the week score. Equal by default; the user
  changes it on the review screen or any time later ("this year the
  company matters most")
- **Planned hours per week** (optional): e.g. IT 45 · company 10 ·
  startup 5 · health 5 · learning 3

The importer creates the streams from the file's own headings ("Money and
Work", "Health", "Year by Year" bullets) and splits mixed sections by subject.
It proposes the streams the user mentioned but the file doesn't cover
(**Learning**, **Daily life**) as empty streams to fill in or delete.

### 7.2 Where the week's time went

The IT job is a stream like any other, but it mostly *uses up* time. Everything
else fits in what's left. The roadmap page shows one bar per week: **planned
hours by stream vs logged hours**, from the existing daily time log. A time
entry counts towards a stream when its sprint task or todo is linked to one
of the stream's goals. Every stream has an auto-created "ongoing work" goal,
so linking is one tap and needs no specific milestone.

This makes trade-offs visible instead of guilty: *"IT took 58 h this week
(planned 45), so the company got 4 h instead of 10."* When that happens two
weeks running, the app offers to mark it as a hurdle (§7.4).

### 7.3 The week score

One number per week, 0–100. It's the "daily/weekly progress" the whole plan
reports.

```
stream score =  60 × levers     average over levers of min(1, done ÷ this week's target)
             +  25 × direction  outcome trend, last 4 weeks vs the 4 before:
                                 improving 1 · holding 0.6 · slipping 0.3 · already at target 1
             +  15 × milestones a step done this week 1 · one due in ≤ 30 days but untouched 0.5

week score   =  Σ (stream score × stream weight) ÷ Σ weights
```

- A part with nothing to measure (no outcome readings in the window, no
  milestone due within 90 days) has its weight moved to levers, so a stream
  is never marked down for having no data.
- **Slipping still scores 0.3, not 0.** A bad month on the scale can't
  wipe out a week of kept habits.
- Solid week ≥ 70. Streams are listed under the score, so it's clear which one
  carried the week and which one needs attention.

**Improving** is judged against your past self, not only against the plan: the
4-week average of the week score vs the previous 4 weeks gives **Improving /
Steady / Dipping**. This is the headline under the score. You can be behind
the original schedule and still see *"Improving: 4 weeks better than the 4
before."*

### 7.4 Hurdles

A hurdle is declared (or accepted when the app suggests it) for one stream or
for everything: *"Release crunch at work, 2 weeks"*, *"Fever"*, *"Sister's
wedding"*.

While a hurdle is active:
- **Levers in that stream use their floor as the target.** Two walks during a
  fever is a full-marks week, so doing the minimum keeps the week solid.
- **Effort checkpoints in that stream shift right by the hurdle's length.** The
  plan clock pauses, so time spent in the hurdle doesn't count against pace.
  Calendar checkpoints (the last EMI, age-based events) never move. Each shift is
  recorded (`shifted_days`) and shown: *"End-2026 weight moved to 14 Jan:
  2-week hurdle (fever)."*
- **Journey % is untouched.** It's distance covered, which a hurdle can't undo.
- The other streams carry on normally, so an IT crunch doesn't pause health.

When it ends ("I'm back" or the end date), the first solid week after it earns
a **Comeback** (the existing badge idea, applied per stream).

**Guardrails, so hurdles don't become a way to never be behind:**
- The app suggests a hurdle; it never declares one itself. Two weeks under
  40 in a stream prompts: *"Rough patch in the startup? Mark it as a hurdle
  and the plan will adjust."*
- Shifts are capped at **8 weeks per stream per year**. Past that, the app
  switches to the file's own rule, *"Missed two years in a row? Rethink the
  strategy"*, and offers a replan (§7.5) instead of more shifting.

### 7.5 Forecast and replanning

Every outcome gets a **forecast line** next to the plan line: your recent
pace, fitted over the last 8 weeks (a straight line, or a log fit for
compounding metrics), extended forward.

- *"At your last 8 weeks' pace you reach 89–90 kg on 2 Jan, 2 days after
  the checkpoint."*
- A stream's forecast is the median of its outcomes: **ahead / on schedule /
  N weeks late**.

When a forecast is late, the card gives one of two answers:
1. **Recoverable:** the pace needed is at or below your best 8-week pace so far.
   It names the lever: *"Add one strength session a week; you did that pace in
   October."*
2. **Not realistic right now:** it offers a **replan** that moves the checkpoint
   to the forecast date. The user accepts or edits it; nothing moves silently.
   The old target stays on record, so history is still judged against the
   plan as it was.

It also works the other way, from the file: *"Beat the target? Move the plan
forward a year"* becomes an offer to pull checkpoints earlier when a stream's
forecast is ahead for 3 months.

---

## 8. Screens

Roadmaps join the existing Plan tabs: **This week · Goals · Roadmap**.

0. **Dashboard strip**: "Roadmap today" with today's levers across all streams
   (auto ones already ticked), this week's score so far with Improving / Steady /
   Dipping, and the journey %. It sits next to the existing Today card and is
   the thing seen every day. An active hurdle shows as a quiet line: *"Health
   on minimums: fever, day 3."*

1. **`/roadmap/import`**: paste or upload `.md` → "Reading your plan…" → review
   screen (§2). A "Download blank template" link sits above the box.
2. **`/roadmap/[id]`**: the main view
   - **Header**: title, journey bar ("12% of the way · year 1 of 8"), chapter
     bar ("2026 chapter: 40%"), pill: *7 on track · 2 catching up · 3 need a reading*
   - **Week score**: a 12-week sparkline of week scores with solid weeks
     marked and hurdle weeks shaded. Beneath it, one row per stream: its
     score, planned vs logged hours, and a "Mark a hurdle" action.
   - **Stream sections** (one per stream, collapsible), each holding:
     - **Metric cards**: small Recharts chart with the expected band shaded, the
       actual line, a dashed forecast line (§7.5), and checkpoint dots labelled
       "End of 2026". One line underneath: *"6.1 kg down: on track for 89–90
       by 31 Dec."* Then the card's levers for this week. Manual metrics have an
       inline "Log value" button.
     - **Checklists and milestones** for the stream
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

## 9. Phases

**Phase 1: import and streams**
- Migration: `roadmaps`, `roadmap_streams`, `roadmap_metrics`, `roadmap_targets`,
  `roadmap_readings`, `roadmap_levers`, `roadmap_lever_ticks`, `goals.roadmap_id`,
  `goals.stream_id`
- `lib/roadmap/extract.ts`: Gemini schema and prompt; lakh/crore and date
  normalisation; groups everything into streams; suggests levers (with
  floors) and the streams the file is missing
- `lib/roadmap/projection.ts`: expected band and status, tested against the example
- Import + review screen (streams, weights, metrics, levers, checklists)
- Roadmap page: stream sections, metric cards, checklists
- Auto sources: weight, waist, body fat, loan schedule

**Phase 2: daily progress and hurdles** (the motivation loop)
- `lib/roadmap/progress.ts`: lever completion, week score, Improving / Steady /
  Dipping, journey % and chapter %, all tested against the example fixture
- Lever sources: workouts, meals, linked hours (via each stream's
  "ongoing work" goal), daily-log tracked days; ticks for the rest
- Dashboard "Roadmap today" strip; week-score sparkline
- `roadmap_hurdles`: floors, effort-checkpoint shifts, the 8-week cap,
  suggested hurdles, Comeback

**Phase 3: forecast and adapt**
- Forecast lines; recoverable-vs-replan suggestions; replans with the old
  target kept on record; "beat it, pull it forward" offers
- Planned vs logged hours per stream
- Gates + evaluation; workouts and meals as outcome sources
- Due-reading prompts; yearly recurring checklist
- XP + achievement tie-ins (§6.5); coach tool `get_roadmap_status`

**Phase 4: living plan**
- Re-import an edited `.md`: diff by stream + metric `key`, keep readings,
  show what changed before applying
- Scenarios: base + stretch lines on the same chart
- Cash-flow block: budget lines with end dates (bike EMI ends Oct 2027)
  project the monthly balance automatically
- Reviewer sharing, per area (share health, keep money private)

---

## 10. Decisions (2026-09-19)

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
5. **Every front of life counts.** The IT job, Dad's company, the startup,
   health, money, family, learning and daily life are separate streams, all
   feeding one weighted week score (§7.3).
6. **Hurdles cost pace, never progress.** Floors keep a hard week solid, effort
   checkpoints shift by the hurdle's length (capped at 8 weeks per stream per
   year), and the journey bar is untouched (§7.4). "Improving" is measured
   against your own last 4 weeks, not only the plan.
