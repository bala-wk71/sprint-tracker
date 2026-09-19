# Goal Planning Plan

## The one idea

**Every goal gets the same treatment**: body weight, muscle, looks, a skill like
embedded systems, the startup, the family business, the IT job, money. Each
one has:

1. **A target**: where you want to be, and by when
2. **A plan**: the path to it, broken into years, quarters, months and weeks,
   plus the actions that move it
3. **Tracking**: numbers go in (typed, or pulled from data the app already has)
4. **Reports**: how you are doing against the plan, and what to do next

A target can come from three places, and all three produce the same draft that
you review before anything is saved:

- **Plan it with the AI**: a planning conversation with the coach, which
  proposes realistic numbers from your baseline and constraints
- **Import a roadmap**: upload a Markdown plan like
  [`templates/ROADMAP_TEMPLATE.md`](templates/ROADMAP_TEMPLATE.md)
- **Type it in yourself**: the same form, with no AI involved

Goals, sprints and todos already cover "what am I doing this week". This adds
the layer above: "is this week's work moving me towards where I said I'd be?"

---

## 1. The shape of every goal

```
Stream           a front of life: "Health", "Embedded skills", "Dad's company"
 └─ Goal         the destination: "80–83 kg by 2028", "Build a flight controller"
     ├─ Measures     how progress is read (outcome + the drivers behind it)
     │   ├─ Checkpoints   where each measure should be on dated points (the path)
     │   └─ Readings      where it actually is
     ├─ Year goal → Quarter goals → Projects (steps)    the cascade (§4)
     ├─ Levers       weekly actions, each with a target and a floor
     └─ Reviews      weekly, monthly, quarterly reports (§6)

Sprint tasks and todos link to a quarter goal or project, so the week's work
and its logged hours roll up the chain.
```

### Streams

A stream is one front of life, defined by the user: IT job, Dad's company,
Drone startup, Health, Looks, Embedded skills, Money, Family & home, Daily
life. Each has an optional **planned hours per week** and a **weight** (how
much it counts in the overall journey %). Streams make trade-offs visible:
*"IT took 58 h this week (planned 45), so embedded got 1 h instead of 5."*

Every stream has an auto-created "ongoing work" goal, so any sprint task or
todo can be linked to the stream in one tap, even when it serves no specific
milestone.

---

## 2. Measuring anything

Some goals are a number. Others (looks, a skill) aren't, but they can still be
measured honestly. There are five kinds of measure:

| Kind | What it is | A reading is | Good for |
|---|---|---|---|
| **Number** | A value with a unit and a direction | The value | Weight, body fat %, muscle mass, waist, profit, revenue, savings |
| **Ladder** | Named levels, each with a definition of done and a **proof** | The level reached, plus the proof (a link, photo or note) | Skills (embedded L1 → L6), running (3 km → 5K → 10K), strength standards |
| **Rubric** | 3–6 criteria, each rated 1–5 against written descriptions of 1, 3 and 5 | Scores per criterion, averaged | Looks, posture, communication, product quality: anything judged, not counted |
| **Lever** | A repeated action with a target and a floor per week or month | Count done (auto or ticked) | Workouts, protein days, practice hours, quotes sent, applications |
| **Milestone** | Done or not, by a date | Done date | Founders' agreement, workshop move, first paying customer |

**Proof** matters for ladders and rubrics, which would otherwise be pure
self-report: a GitHub link for "wrote an I2C driver from the datasheet", a
monthly progress photo for looks, a race result for the 5K.

**Progress photos** go in a private Supabase Storage bucket. Only the owner
sees them: never reviewers, and never sent to the AI unless the user turns
that on per photo.

### Every goal, mapped

| Goal | Outcome measure | Drivers / levers | Path (example) | Weekly work |
|---|---|---|---|---|
| **Body weight** | Weight, 7-day average (auto from `body_metrics`) | Calories in range 5 days · protein 130 g+ 5 days · strength 3–4 · walk/run 3+ | 95 → 89–90 (Dec 2026) → 86 (Mar 2027) → 82–85 (Jun 2027), then hold 80–83 | Workouts and meals get logged; auto-ticked |
| **Muscle** | Skeletal muscle % or muscle mass (auto, scale) · main lifts' estimated 1-rep max (auto, `workout_sets`) | Strength 3–4 · protein 130 g+ · progressive overload (a top set beaten every 2 weeks) | **Hold** muscle mass while cutting (to mid-2027), then +0.25–0.5 kg/month · bench 60 → 80 kg, squat 80 → 110 kg by end 2027 | Planned sessions in the week |
| **Looks** | Rubric, monthly: face leanness · posture · skin · hair & grooming · style/fit, plus waist and photos | Skincare AM/PM · posture drills 3× · grooming routine · sleep 7 h+ 5 nights | Rubric 2.2 → 3.0 (Dec 2026) → 3.8 (Jun 2027); waist under 94 cm | Routine ticks; one photo set a month (same light, same angles) |
| **Embedded skills** | Ladder L1–L6 with proof (below) | Deliberate practice 5 h/week · one mini-project a month · notes written | L2 by Dec 2026 → L4 by Jun 2027 → L5 by Dec 2027 | Sprint tasks for the current project; hours logged |
| **Drone startup** | Paying customers · revenue | Hours 5/week · leads contacted · demos · proposals | 1 order → 3 customers (end 2026) → ₹25–50 L revenue (2027) → **decision gate** (2028) | Leads and demos as tasks |
| **Dad's company** | Monthly profit (Oct–Dec average for the year number) · revenue · margin | Quotes sent/week · follow-ups · target-customer list | ₹1.0 L → ₹1.4 L profit/month (Dec 2027); quarters in §4 | Sales calls, quotes, move tasks |
| **IT job** | Salary · offer in hand | Interview prep 2 h/week · applications/week | Resume by Sep 27 → switch in 2027 → quit gate (2030) | Prep and application tasks |
| **Money** | Emergency fund · loans left (computed) · monthly balance · investments | Monthly transfer · card paid in full · SIP running | ₹1 L → ₹2.5 L (2027) → ₹4 L (2028) · debt-free Sep 2029 | Monthly ticks |

**Embedded ladder** (each level needs its proof before it counts):

| Level | Done when | Proof |
|---|---|---|
| L1 | Toolchain set up; GPIO, blink, button with debounce on a bare MCU (not Arduino libraries) | Repo |
| L2 | UART, I2C and SPI drivers written from the datasheet; read a real sensor (IMU) | Repo + logic-analyser capture |
| L3 | Interrupts, timers, PWM, DMA; motor or ESC control at a steady loop rate | Repo + scope/timing screenshot |
| L4 | FreeRTOS multi-task project: sensor fusion + telemetry | Repo + demo video |
| L5 | Own PCB, or a drone-grade module (flight-controller telemetry, ESC comms) used by the startup | Board / module + write-up |
| L6 | Shipped in a real product, or published and reused by others | The product or the repo's users |

The top levels point at the startup on purpose: the skill goal and the
startup goal feed each other, and the report shows that link.

---

## 3. Setting targets: plan with the AI, import, or type it in

All three produce a **plan draft** (`plan_drafts.payload`, the same JSON the
importer produces). The draft is reviewed on one screen and saved in one
transaction. **The AI never writes goals directly**: it proposes, and the user
commits. This keeps the coach's current rule: it reads your data, it doesn't
change it.

### 3.1 Planning with the AI

A planning session is a coach thread (the existing threads and streaming)
started from "Plan a goal with the coach", in a planning mode. Each stream
type gets a specialist prompt, so the user works with an **AI team**:

| Planner | Streams | Knows about |
|---|---|---|
| Health coach | Health, muscle, looks | Safe rates of change, training and nutrition basics, what the scale's numbers mean |
| Business advisor | Company, startup, money | Unit economics, driver trees, growth rates, cash flow |
| Skills mentor | Embedded, IT, any learning | Skill ladders, deliberate practice, proof-of-work projects |

They share one model; only the system prompt and the reference ranges differ.

**The conversation follows a fixed sequence**, so every plan comes out complete:

1. **The goal in your words.** *"I want to get good at embedded for the drone startup."*
2. **Baseline.** The planner reads what the app already has (`get_health`,
   `get_goals`, `get_progress`: the existing read-only tools) and asks only for
   what's missing: *"What have you built so far? Which MCU?"*
3. **Constraints.** Hours per week available (checked against the other
   streams' planned hours), budget, equipment, fixed dates.
4. **Realism check.** The proposal is checked against evidence ranges and the
   user's own history:
   - Fat loss 0.5–1% of body weight a week; muscle held during a cut, then
     roughly +0.25–0.5 kg a month for a beginner-to-intermediate lifter
   - A skill level takes roughly 40–120 hours of deliberate practice at
     these early levels
   - Business growth checked against the last 12 months' actual trend
   - *"At 5 h/week, L4 by March isn't realistic; June is."*
5. **Three options.** **Steady** (safe), **Target** (the recommended one) and
   **Stretch**, each with its path and the weekly work it demands. The user
   picks one or adjusts it.
6. **The cascade.** Year → quarter numbers, this quarter's projects, weekly
   levers with floors (§4).
7. **Draft.** The planner calls a new tool, `propose_plan`, whose argument is
   the draft JSON. The chat shows it as a card, "Review and save", which opens
   the review screen.

The user can go back and forth at any step ("make the weekly hours 3"), and
the planner re-proposes.

### 3.2 Importing a roadmap

Upload a Markdown roadmap. Gemini `generateJson` extracts a plan draft
(streams, goals, measures, checkpoints, levers, checklists, gates, notes). It
must handle:
- **Loose dates**: "End of 2026", "Mid-2027", "Age 32" (from a birth year)
- **Ranges and bounds**: "89–90", "under 94", "₹50,000+", "held steady"
- **Relative targets**: "down 4–5 cm" from a baseline that says "to measure"
- **Lakh/crore**: ₹1.4 lakh → 140,000
- **Non-numeric targets**: "run 10K comfortably" becomes a ladder rung or a milestone
- **Branching outcomes**: "₹5–10 Cr revenue *or* wound down by 28" becomes a gate

Anything it can't place becomes a note, so nothing is lost. Streams the user
lives but the file doesn't cover (e.g. Learning) come up as empty streams to
fill in; "Plan this with the coach" hands them to §3.1.

**The acceptance test** is the author's own 2026–2034 roadmap (written without
the template) importing cleanly into the goals in §2.

### 3.3 Typing it in

The same review screen, empty. Pick a stream and a measure kind, then enter
the target, checkpoints and levers. A "Suggest a path" button fills the
quarter numbers from the start and target (straight line, or compounding for
growth metrics), and the user edits them.

---

## 4. The cascade: from the destination to this week's tasks

Every goal is planned the same way:

| Level | Holds | Lives in the app as |
|---|---|---|
| **Destination** | 1–2 outcome numbers, or a ladder level | The goal + its measures' last checkpoints |
| **Year** | The **December number** (e.g. the Oct–Dec average, so one lumpy month can't make or break it) + 2–4 enabling milestones | A checkpoint + a year goal (steps) |
| **Quarter** | One path number or level at quarter end + **1–3 projects** that make it possible | A quarter goal under the year goal (`parent_id`), with steps |
| **Month** | Review: actual vs path for the outcome and its drivers | Readings + the monthly report (§6) |
| **Week** | Sprint tasks taken from the quarter's projects + the levers | Sprint tasks with `goal_id`; lever ticks |

### How to set the numbers

1. **Start from the destination and a realistic rate.** A rate of change
   (0.5–0.75 kg a week), a growth rate (40% a year), or hours per level.
2. **Turn the outcome into drivers you can act on this week.** Nobody can
   "do profit" or "do muscle" on a Tuesday:
   - profit = revenue × margin; revenue = orders × order value; orders = quotes × win rate
   - muscle = training stimulus (progressive overload) × protein × recovery
   - skill = deliberate-practice hours × projects finished at the edge of your level
3. **Fit the path to the calendar.** Known events shape quarters: the
   workshop move (Q2 2027) protects profit instead of growing it; a wedding
   month holds weight instead of cutting.
4. **Check capacity.** Hours per week across all streams must fit the week.
   The IT job takes its hours first.
5. **Review on a rhythm**: weekly levers, monthly numbers, quarterly
   re-planning, yearly reset (beat it → move forward; missed two years →
   rethink).

### Worked example: the company in 2027

**Is ₹10 L/month revenue the right target?** It depends on the margin. The
roadmap's 2034 goal (₹1.5–1.8 Cr profit on ₹15–20 Cr revenue) implies about 10%:

| Margin | Revenue today (₹1.0 L profit) | Revenue needed, end 2027 (₹1.4 L profit) |
|---|---|---|
| 10% | ₹10 L/month | ₹14 L/month |
| 15% | ₹6.7 L/month | ₹9.3 L/month |
| 20% | ₹5 L/month | ₹7 L/month |
| 25% | ₹4 L/month | ₹5.6 L/month |

₹10 L/month matches the plan only at about a 14% margin. **The real margin
comes first**, from the last 12 months of the company's books.

| Quarter | Profit/month (quarter average) | Projects |
|---|---|---|
| Q4 2026 | ₹1.0 L (hold) | Pull 12 months of real numbers · list 20 target customers · contact 10 |
| Q1 2027 | ₹1.1 L | Book 3 months of orders for Apr–Jun · plan the move |
| Q2 2027 | ₹1.0 L (protect) | Move in April with less than 2 weeks of lost production |
| Q3 2027 | ₹1.2 L | Fill the new capacity with customers from the list |
| Q4 2027 | **₹1.4 L** | Hit the year number · write the 2028 plan |

Weekly driver (illustrative, at a 10% margin): ₹14 L ÷ ₹2 L average order = 7
orders/month; at 1-in-3 wins that's about 21 quotes/month, or **5 quotes a week**.

### Worked example: embedded, next 12 months

At 5 h/week (about 65 h a quarter):

| Quarter | Level at quarter end | Projects |
|---|---|---|
| Q4 2026 | L2 | Bare-metal blink and UART on the chosen MCU · I2C IMU driver from the datasheet |
| Q1 2027 | L3 | Timer/PWM motor control · interrupt-driven sensor reads with DMA |
| Q2 2027 | L4 | FreeRTOS: IMU fusion task + telemetry task, shown on the startup's drone |
| Q3 2027 | L4 → L5 | Telemetry module the startup actually uses |

Weekly: 5 h of practice (logged against the quarter's project), and the
project's next step as a sprint task.

---

## 5. Tracking

**Readings** come from:
- **Auto sources** (no typing): `body_metrics` (weight 7-day average, waist,
  body fat, muscle), `workout_sets` (estimated 1-rep max per main lift),
  `workouts` (sessions/week), `meals` (calories, protein), the daily log
  (tracked days), loan schedules (EMI + last EMI date)
- **Linked hours**: time logged on sprint tasks and todos linked to a goal or
  its stream
- **Typed**: a number, a ladder level + proof, or rubric scores, prompted when
  the measure's cadence says one is due ("Log September's company profit")
- **Later**: the separate company app sends the month's revenue, profit,
  orders and quotes

**Levers** are counted per week or month, never as streaks, so a missed day
costs nothing on its own. Each has a **floor** for hard weeks.

**Hurdles** (illness, a work crunch, a wedding) are declared for one stream or
all of them:
- Levers drop to their floors
- **Effort** checkpoints shift later by the hurdle's length; **calendar**
  checkpoints (the last EMI) never move
- The app only *suggests* a hurdle, after two weeks with most of a stream's
  levers missed
- Shifts are capped at 8 weeks per stream per year; past that, it offers a replan

---

## 6. Reports

Reports answer three questions every time: **Where am I vs the plan? What
moved it? What's next?** They build on the existing goal review (direction,
reasons, next step) and health report patterns.

| Report | When | Written by | Contents |
|---|---|---|---|
| **Weekly check** | Sunday evening, automatic | Code, no AI | Per stream: levers kept, tasks done on the quarter's projects, hours vs plan, any reading due |
| **Monthly report** | 1st of the month (or on demand) | AI + numbers | Per stream: path vs actual for each outcome, the forecast, drivers, **what moved it**, one next focus |
| **Quarterly review** | Last week of the quarter | AI, as a conversation | Quarter goals hit or missed and why · re-forecast · **proposes next quarter's numbers and projects** as a plan draft to accept or edit |
| **Yearly review** | January | AI, as a conversation | The year number vs the plan · the file's rule (beat → pull forward; missed twice → rethink) · protection checks (insurance, health tests) |

**"What moved it"** is computed before the AI writes anything, from the
data. For example, it compares weeks where a lever was kept with weeks where
it wasn't: *"Weeks with 4 strength sessions averaged −0.8 kg; weeks with 2
averaged −0.2 kg."* The AI explains numbers; it doesn't invent them.

**Example monthly report line (Health, September):**
> Weight 93.1 kg, just ahead of the path (93.4). Strength 11 of 14 sessions;
> protein hit on 18 of 30 days. Weeks with 4 sessions lost 0.8 kg vs 0.2 kg with 2.
> **Next focus:** protein on weekdays; the weekends are already fine.

**Tone rules** (the user asked for "motivating, not depressing"):
- Lead with distance covered: "6.1 kg down, 58% of the way", not "9.4 kg to go"
- Behind is shown as **"Catching up"**, always with one concrete way back
- "Improving" is measured against your own last 4 weeks, not only against the plan
- The journey bar uses the **best** reading reached, so it never goes backwards;
  the card shows "best 88.9 · now 89.6"
- No points, no score: the real numbers against the path

Reports are saved (`plan_reports`), so a month can be compared with the last
one, and the coach can reference them in chat.

---

## 7. Projection math

`lib/planning/projection.ts`: pure functions, unit-tested against the example
roadmap.

**Expected band on date _d_**: anchor at the baseline, then interpolate `min`
and `max` separately between the surrounding checkpoints:
- `linear` (weight, waist), `compound` (profit: `a · (b/a)^t`), or `step` (a loan
  hitting 0, a ladder level)
- `hold_until` keeps the band flat after it's reached
- A missing bound is open-ended ("under 94")
- Relative targets wait for a baseline reading ("Needs a first measurement")

**Actual on date _d_**: the latest reading, or a trailing aggregate for auto
sources (weight on a 7-day average, levers per week).

**Status** (direction-aware, like `lib/pace.ts`): ahead / on track / catching
up / off band / stale (no reading within 2× the cadence).

**Forecast**: fit the last 8 weeks (linear, or log for compounding measures)
and extend it: *"At this pace you reach 89–90 kg on 2 Jan."* When the
forecast is late:
- **Recoverable**: the needed pace is within your best 8-week pace. The
  report names the lever to push.
- **Not realistic right now**: it offers to move the checkpoint. The user
  accepts; nothing moves silently, and the old target is kept on record.

When the forecast is ahead for 3 months, it offers to pull the plan forward.

**Gates** (e.g. "quit the IT job when all four are true") are evaluated from
the measures, with `sustained_months` for "₹3.5 L profit for 6 months in a
row", and manual ticks for the rest.

---

## 8. Data model

It builds on `goals` instead of a parallel system: goals already nest
(`parent_id`), have steps, check-ins, reviews, and links to sprint tasks and
todos. All tables are owner-only RLS; reviewers see a stream only when the
owner shares it.

```sql
-- Fronts of life. Owner-level; a roadmap import can create them, but they
-- exist without one.
create table public.streams (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.users(id) on delete cascade,
  name          text not null,
  area          text not null,                 -- GOAL_AREA_VALUES, for colour
  weight        numeric not null default 1,    -- share of the journey %
  weekly_hours  numeric,
  shared_with_reviewers boolean not null default false,
  ongoing_goal_id uuid references public.goals(id) on delete set null,
  position      integer not null default 0,
  archived_at   timestamptz,
  unique (owner_id, name)
);

alter table public.goals
  add column stream_id  uuid references public.streams(id) on delete set null,
  add column roadmap_id uuid references public.roadmaps(id) on delete set null,
  add column level      text check (level in ('destination', 'year', 'quarter', 'project'));

-- How a goal's progress is read. A goal has one outcome measure and any
-- number of driver measures (parent_measure_id builds the driver tree).
create table public.goal_measures (
  id            uuid primary key default gen_random_uuid(),
  goal_id       uuid not null references public.goals(id) on delete cascade,
  owner_id      uuid not null references public.users(id) on delete cascade,
  key           text not null,                 -- stable slug; survives re-import
  label         text not null,
  kind          text not null check (kind in ('number', 'ladder', 'rubric')),
  role          text not null default 'outcome' check (role in ('outcome', 'driver')),
  parent_measure_id uuid references public.goal_measures(id) on delete set null,
  unit          text,
  direction     text check (direction in ('down', 'up', 'band')),
  interpolate   text not null default 'linear' check (interpolate in ('linear', 'compound', 'step')),
  source        text not null default 'manual', -- 'manual' | 'body.weight_kg' | 'lifts.e1rm' | 'loan_schedule' | 'company_app' ...
  source_params jsonb not null default '{}',
  cadence       text not null default 'monthly' check (cadence in ('weekly', 'monthly', 'quarterly')),
  -- ladder: [{ "level": 2, "title": "UART/I2C/SPI from datasheet", "proof": "repo + capture" }]
  -- rubric: [{ "key": "posture", "title": "Posture", "one": "...", "three": "...", "five": "..." }]
  scale         jsonb not null default '[]',
  unique (goal_id, key)
);

-- The path: where a measure should be on a date.
create table public.measure_checkpoints (
  id            uuid primary key default gen_random_uuid(),
  measure_id    uuid not null references public.goal_measures(id) on delete cascade,
  owner_id      uuid not null references public.users(id) on delete cascade,
  target_date   date not null,
  label         text,                           -- "End of 2026", "Q2 2027"
  min_value     numeric,
  max_value     numeric,
  relative      boolean not null default false,
  hold_until    date,
  kind          text not null default 'effort' check (kind in ('effort', 'calendar')),
  shifted_days  integer not null default 0,
  replaced_by   uuid references public.measure_checkpoints(id),  -- replans keep the old row
  check (min_value is not null or max_value is not null)
);

-- Where it actually is. Auto sources are read live and never copied here.
create table public.measure_readings (
  id            uuid primary key default gen_random_uuid(),
  measure_id    uuid not null references public.goal_measures(id) on delete cascade,
  owner_id      uuid not null references public.users(id) on delete cascade,
  measured_on   date not null,
  value         numeric not null,               -- number, ladder level, or rubric average
  detail        jsonb,                          -- rubric scores per criterion
  proof_url     text,                           -- repo link, or a storage path for a photo
  note          text,
  unique (measure_id, measured_on)
);

-- Weekly/monthly actions, with a floor for hard weeks.
create table public.goal_levers (
  id            uuid primary key default gen_random_uuid(),
  goal_id       uuid not null references public.goals(id) on delete cascade,
  owner_id      uuid not null references public.users(id) on delete cascade,
  title         text not null,
  source        text not null default 'tick',   -- 'tick' | 'workouts.strength' | 'meals.protein_min' | 'linked_hours' ...
  source_params jsonb not null default '{}',
  period        text not null check (period in ('week', 'month')),
  target        numeric not null,
  floor         numeric not null
);

create table public.lever_ticks (
  lever_id  uuid not null references public.goal_levers(id) on delete cascade,
  owner_id  uuid not null references public.users(id) on delete cascade,
  done_on   date not null,
  count     numeric not null default 1,
  primary key (lever_id, done_on)
);

create table public.hurdles (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.users(id) on delete cascade,
  stream_id   uuid references public.streams(id) on delete cascade,  -- null = everything
  reason      text not null,
  starts_on   date not null,
  ends_on     date
);

-- Decision rules: conditions as jsonb (metric tests, sustained months, manual ticks).
create table public.gates (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.users(id) on delete cascade,
  stream_id    uuid references public.streams(id) on delete set null,
  title        text not null,
  conditions   jsonb not null,
  manual_ticks jsonb not null default '{}',
  met_on       date
);

-- What the AI planner or the importer proposed, before the user saves it.
create table public.plan_drafts (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.users(id) on delete cascade,
  origin      text not null check (origin in ('ai', 'import', 'manual', 'quarterly_review')),
  thread_id   uuid,                              -- the coach thread it came from
  payload     jsonb not null,
  status      text not null default 'open' check (status in ('open', 'saved', 'discarded')),
  created_at  timestamptz not null default now()
);

-- Saved reports: numbers computed by code, words by the AI.
create table public.plan_reports (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.users(id) on delete cascade,
  period       text not null check (period in ('week', 'month', 'quarter', 'year')),
  period_start date not null,
  stream_id    uuid references public.streams(id) on delete cascade,  -- null = all streams
  numbers      jsonb not null,                   -- path vs actual, levers, drivers, what moved it
  summary      text,
  next_focus   text,
  created_at   timestamptz not null default now(),
  unique (owner_id, period, period_start, stream_id)
);

-- The uploaded Markdown, kept for re-import and its reference notes.
create table public.roadmaps (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.users(id) on delete cascade,
  title       text not null,
  source_md   text not null,
  notes_md    text not null default '',
  birth_date  date,
  status      text not null default 'active' check (status in ('active', 'archived')),
  created_at  timestamptz not null default now()
);
create unique index roadmaps_one_active on public.roadmaps (owner_id) where status = 'active';
```

**Existing goals**: number goals keep working as they are. The first time one
is opened in the new view, its `start_value`/`target_value`/`current_value`
become an outcome measure with one checkpoint and one reading.

---

## 9. Screens

- **Stream page** (`/plan/[stream]`): the stream's goals, each with its path
  chart (plan band, actual, forecast, checkpoints), this quarter's goals and
  projects, levers this week, and hours vs plan. There's a "Plan a goal with
  the coach" button.
- **Plan overview** (`/plan`): one row per stream showing the quarter's path
  number vs actual and its projects, plus the journey bar. The Plan tabs become
  **This week · Goals · Plan**.
- **Review screen**: where any draft (AI, import, manual, quarterly review) is
  edited and saved: streams, goals, measures, checkpoints, levers, projects.
- **Planning chat**: the coach, in planning mode with a specialist, ending in
  a "Review and save" card.
- **Sprint setup**: shows the current quarter's projects per stream so the
  week's tasks are picked from them and linked in one tap.
- **Dashboard**: a "Plan today" strip with today's levers (auto ones ticked),
  the week's tasks on quarter projects, and any reading due.
- **Reports** (`/plan/reports`): weekly checks, monthly reports and quarterly
  reviews, each comparable with the previous one.

---

## 10. Phases

**Phase 1: the goal shape, planned by hand**
- Migration: `streams`, `goal_measures`, `measure_checkpoints`,
  `measure_readings`, `goal_levers`, `lever_ticks`, goal columns
- Number and ladder measures; milestones via goal steps
- `lib/planning/projection.ts` + tests (the weight, company and embedded examples)
- Manual review screen with "Suggest a path"; stream page with path charts;
  the cascade (year → quarter → project goals); sprint tasks linked to quarter projects
- Auto sources: weight, waist, body fat, muscle, loan schedule; linked hours

**Phase 2: plan with the AI, and import**
- `plan_drafts`; the `propose_plan` tool; planning mode with the three
  specialists and the fixed sequence (§3.1)
- Markdown import into the same draft (§3.2); the example roadmap as the
  acceptance test

**Phase 3: reports**
- Weekly check (code only), monthly report (AI), quarterly review that
  proposes next quarter as a draft, yearly review; `plan_reports`
- "What moved it" analysis; forecasts; recoverable-vs-replan suggestions

**Phase 4: the rest**
- Rubric measures + private progress photos (looks)
- Workout and meal levers; lift estimated 1-rep max as a source
- Hurdles; gates; the driver tree shown under each outcome
- Company app feed; re-importing an edited roadmap; reviewer sharing per stream

---

## 11. Decisions (2026-09-19)

1. **Every goal has the same shape**: target → plan (the cascade) → tracking →
   reports. Weight, muscle, looks, skills, the startup and the company all
   use it.
2. **Anything can be measured**: number, ladder (with proof), rubric, lever,
   milestone.
3. **The AI proposes, the user commits.** Planning chats and the importer
   produce drafts; nothing is saved without review.
4. **Real numbers, no points.** Progress is actual vs the path at year,
   quarter, month and week.
5. **One active roadmap per user**; importing a new one archives the old.
6. **Private by default**; reviewers see a stream only when the owner shares it.
7. **Loans are computed** from the EMI schedule; a typed balance overrides the
   schedule after a prepayment.
8. **Hurdles cost pace, never progress**: floors, shifted effort checkpoints,
   a cap of 8 weeks per stream per year.
9. **Photos stay private**: never shared with reviewers, and never sent to the
   AI unless turned on per photo.
