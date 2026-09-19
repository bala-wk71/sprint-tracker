-- 20260919000001_goal_planning.sql
-- Plans behind goals: every goal can carry a target path and be tracked
-- against it. See docs/GOAL_PLANNING_PLAN.md.
--
--   streams              fronts of life ("Health", "Dad's company", "Embedded")
--   goals.stream_id      which stream a goal belongs to
--   goals.level          destination → year → quarter → project (the cascade)
--   goal_measures        how a goal's progress is read (number or ladder)
--   measure_checkpoints  where a measure should be on dated points (the path)
--   measure_readings     where it actually is (typed; auto sources are read live)
--   goal_levers          weekly/monthly actions that move a goal
--   lever_ticks          manual lever completions
--
-- Ownership is enforced by composite foreign keys (child.owner_id must match
-- the parent's), so a row can never be attached to someone else's goal, and
-- the RLS policies stay simple equality checks. Reviewers can read the plan
-- of any goal they can already read (not private); streams stay owner-only.

-- ---------------------------------------------------------------------------
-- Streams

create table if not exists public.streams (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.users(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 60),
  area          text not null check (area in ('work', 'health', 'money', 'people', 'learning', 'self')),
  weekly_hours  numeric(5, 1) check (weekly_hours is null or (weekly_hours >= 0 and weekly_hours <= 168)),
  weight        numeric(4, 1) not null default 1 check (weight >= 0 and weight <= 10),
  position      integer not null default 0,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint streams_id_owner_key unique (id, owner_id)
);

create unique index if not exists streams_owner_name_key
  on public.streams (owner_id, lower(name)) where archived_at is null;
create index if not exists streams_owner_idx on public.streams (owner_id, position);

drop trigger if exists streams_set_updated_at on public.streams;
create trigger streams_set_updated_at
before update on public.streams
for each row execute function public.set_updated_at();

alter table public.streams enable row level security;

drop policy if exists "streams owner all" on public.streams;
create policy "streams owner all"
  on public.streams for all
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Goals join streams and the cascade

create unique index if not exists goals_id_owner_key on public.goals (id, owner_id);

alter table public.goals
  add column if not exists stream_id uuid,
  add column if not exists level     text check (level in ('destination', 'year', 'quarter', 'project'));

alter table public.goals drop constraint if exists goals_stream_fkey;
alter table public.goals
  add constraint goals_stream_fkey
  foreign key (stream_id, owner_id) references public.streams (id, owner_id)
  on delete set null (stream_id);

create index if not exists goals_stream_idx on public.goals (stream_id) where stream_id is not null;

-- ---------------------------------------------------------------------------
-- Measures

create table if not exists public.goal_measures (
  id                uuid primary key default gen_random_uuid(),
  goal_id           uuid not null,
  owner_id          uuid not null,
  label             text not null check (char_length(label) between 1 and 80),
  kind              text not null default 'number' check (kind in ('number', 'ladder', 'rubric')),
  role              text not null default 'outcome' check (role in ('outcome', 'driver')),
  parent_measure_id uuid references public.goal_measures(id) on delete set null,
  unit              text check (char_length(unit) <= 20),
  direction         text not null default 'down' check (direction in ('down', 'up', 'band')),
  interpolate       text not null default 'linear' check (interpolate in ('linear', 'compound', 'step')),
  -- 'manual' | 'body.weight_kg' | 'body.waist_cm' | 'body.body_fat_pct'
  -- | 'body.muscle_mass_kg' | 'body.skeletal_muscle_pct' | 'loan_schedule'
  source            text not null default 'manual' check (char_length(source) <= 40),
  source_params     jsonb not null default '{}',
  cadence           text not null default 'monthly' check (cadence in ('weekly', 'monthly', 'quarterly')),
  -- Where the path starts. For auto sources it is filled from the first
  -- reading on or after the goal's start when left empty.
  baseline_value    numeric,
  baseline_on       date,
  -- Ladder levels: [{ "level": 2, "title": "...", "proof": "..." }]
  scale             jsonb not null default '[]',
  position          integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint goal_measures_id_owner_key unique (id, owner_id),
  constraint goal_measures_goal_fkey foreign key (goal_id, owner_id)
    references public.goals (id, owner_id) on delete cascade,
  constraint goal_measures_baseline_pair check ((baseline_value is null) = (baseline_on is null))
);

create index if not exists goal_measures_goal_idx on public.goal_measures (goal_id, position);
create index if not exists goal_measures_owner_idx on public.goal_measures (owner_id);
create index if not exists goal_measures_parent_idx
  on public.goal_measures (parent_measure_id) where parent_measure_id is not null;

drop trigger if exists goal_measures_set_updated_at on public.goal_measures;
create trigger goal_measures_set_updated_at
before update on public.goal_measures
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Checkpoints: the path

create table if not exists public.measure_checkpoints (
  id            uuid primary key default gen_random_uuid(),
  measure_id    uuid not null,
  owner_id      uuid not null,
  target_date   date not null,
  label         text check (char_length(label) <= 40),
  min_value     numeric,
  max_value     numeric,
  relative      boolean not null default false,
  hold_until    date,
  -- 'effort' checkpoints may shift for hurdles; 'calendar' ones never move.
  kind          text not null default 'effort' check (kind in ('effort', 'calendar')),
  shifted_days  integer not null default 0,
  created_at    timestamptz not null default now(),
  constraint measure_checkpoints_measure_fkey foreign key (measure_id, owner_id)
    references public.goal_measures (id, owner_id) on delete cascade,
  constraint measure_checkpoints_has_bound check (min_value is not null or max_value is not null),
  constraint measure_checkpoints_ordered check (min_value is null or max_value is null or min_value <= max_value),
  constraint measure_checkpoints_hold_after check (hold_until is null or hold_until >= target_date)
);

create index if not exists measure_checkpoints_measure_idx on public.measure_checkpoints (measure_id, target_date);
create index if not exists measure_checkpoints_owner_idx on public.measure_checkpoints (owner_id);

-- ---------------------------------------------------------------------------
-- Readings: where it actually is

create table if not exists public.measure_readings (
  id           uuid primary key default gen_random_uuid(),
  measure_id   uuid not null,
  owner_id     uuid not null,
  measured_on  date not null,
  value        numeric not null,
  detail       jsonb,
  proof_url    text check (char_length(proof_url) <= 500),
  note         text check (char_length(note) <= 500),
  created_at   timestamptz not null default now(),
  constraint measure_readings_measure_fkey foreign key (measure_id, owner_id)
    references public.goal_measures (id, owner_id) on delete cascade,
  -- One reading per day: a second entry corrects the day, not adds to it.
  constraint measure_readings_one_per_day unique (measure_id, measured_on)
);

create index if not exists measure_readings_owner_idx on public.measure_readings (owner_id);

-- ---------------------------------------------------------------------------
-- Levers: the weekly actions that move a goal

create table if not exists public.goal_levers (
  id            uuid primary key default gen_random_uuid(),
  goal_id       uuid not null,
  owner_id      uuid not null,
  title         text not null check (char_length(title) between 1 and 80),
  -- 'tick' | 'workouts' | 'linked_hours'
  source        text not null default 'tick' check (source in ('tick', 'workouts', 'linked_hours')),
  period        text not null default 'week' check (period in ('week', 'month')),
  target        numeric(6, 1) not null check (target > 0),
  -- The minimum that still counts in a hard week.
  floor         numeric(6, 1) not null check (floor >= 0),
  position      integer not null default 0,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint goal_levers_id_owner_key unique (id, owner_id),
  constraint goal_levers_goal_fkey foreign key (goal_id, owner_id)
    references public.goals (id, owner_id) on delete cascade,
  constraint goal_levers_floor_le_target check (floor <= target)
);

create index if not exists goal_levers_goal_idx on public.goal_levers (goal_id, position);
create index if not exists goal_levers_owner_idx on public.goal_levers (owner_id) where archived_at is null;

drop trigger if exists goal_levers_set_updated_at on public.goal_levers;
create trigger goal_levers_set_updated_at
before update on public.goal_levers
for each row execute function public.set_updated_at();

create table if not exists public.lever_ticks (
  lever_id   uuid not null,
  owner_id   uuid not null,
  done_on    date not null,
  count      numeric(6, 1) not null default 1 check (count > 0),
  created_at timestamptz not null default now(),
  primary key (lever_id, done_on),
  constraint lever_ticks_lever_fkey foreign key (lever_id, owner_id)
    references public.goal_levers (id, owner_id) on delete cascade
);

create index if not exists lever_ticks_owner_date_idx on public.lever_ticks (owner_id, done_on);

-- ---------------------------------------------------------------------------
-- RLS: owners do everything; reviewers read the plan of goals they can see.

create or replace function public.goal_visible_to_reviewer(target_goal uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.goals g
     where g.id = target_goal
       and g.is_private = false
       and public.is_reviewer_of(g.owner_id)
  );
$$;

create or replace function public.measure_visible_to_reviewer(target_measure uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.goal_measures m
     where m.id = target_measure
       and public.goal_visible_to_reviewer(m.goal_id)
  );
$$;

revoke execute on function public.goal_visible_to_reviewer(uuid) from public, anon;
revoke execute on function public.measure_visible_to_reviewer(uuid) from public, anon;
grant execute on function public.goal_visible_to_reviewer(uuid) to authenticated;
grant execute on function public.measure_visible_to_reviewer(uuid) to authenticated;

alter table public.goal_measures enable row level security;
alter table public.measure_checkpoints enable row level security;
alter table public.measure_readings enable row level security;
alter table public.goal_levers enable row level security;
alter table public.lever_ticks enable row level security;

drop policy if exists "goal_measures owner all" on public.goal_measures;
create policy "goal_measures owner all" on public.goal_measures for all
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "goal_measures reviewer select" on public.goal_measures;
create policy "goal_measures reviewer select" on public.goal_measures for select
  using (public.goal_visible_to_reviewer(goal_id));

drop policy if exists "measure_checkpoints owner all" on public.measure_checkpoints;
create policy "measure_checkpoints owner all" on public.measure_checkpoints for all
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "measure_checkpoints reviewer select" on public.measure_checkpoints;
create policy "measure_checkpoints reviewer select" on public.measure_checkpoints for select
  using (public.measure_visible_to_reviewer(measure_id));

drop policy if exists "measure_readings owner all" on public.measure_readings;
create policy "measure_readings owner all" on public.measure_readings for all
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "measure_readings reviewer select" on public.measure_readings;
create policy "measure_readings reviewer select" on public.measure_readings for select
  using (public.measure_visible_to_reviewer(measure_id));

drop policy if exists "goal_levers owner all" on public.goal_levers;
create policy "goal_levers owner all" on public.goal_levers for all
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "goal_levers reviewer select" on public.goal_levers;
create policy "goal_levers reviewer select" on public.goal_levers for select
  using (public.goal_visible_to_reviewer(goal_id));

drop policy if exists "lever_ticks owner all" on public.lever_ticks;
create policy "lever_ticks owner all" on public.lever_ticks for all
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
