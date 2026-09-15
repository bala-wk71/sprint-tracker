-- 20260915000002_goals.sql
-- Long-term goals: anything from a week to ten years, tracked by steps, a
-- number, or how on-track it feels. A check-in is a journal entry with a goal
-- attached, so everything written about a goal lives in one timeline.
--
-- Goals are shared with reviewers by default (they are about accountability);
-- journal entries stay private by default. Both are enforced per row.

create table if not exists public.goals (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references public.users(id) on delete cascade,
  -- A goal can sit under a bigger one. Deleting the big goal keeps the small
  -- ones; they just stop pointing anywhere.
  parent_id          uuid references public.goals(id) on delete set null,
  title              text not null check (char_length(title) between 1 and 120),
  why                text not null default '' check (char_length(why) <= 500),
  area               text not null check (area in ('work', 'health', 'money', 'people', 'learning', 'self')),
  horizon            text not null check (horizon in ('1w', '2w', '1m', '3m', '6m', '1y', '3y', '5y', '10y', 'custom')),
  start_date         date not null default current_date,
  target_date        date not null,
  track_type         text not null check (track_type in ('steps', 'number', 'feeling')),
  start_value        numeric,
  target_value       numeric,
  current_value      numeric,
  unit               text check (char_length(unit) <= 20),
  status             text not null default 'active' check (status in ('active', 'paused', 'done', 'let_go')),
  is_private         boolean not null default false,
  pinned             boolean not null default false,
  checkin_every_days integer not null default 7 check (checkin_every_days between 1 and 120),
  -- Denormalised from journal_entries so the dashboard can tell what is due
  -- without aggregating every check-in ever written.
  last_checkin_on    date,
  completed_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint goals_dates_ordered check (target_date >= start_date),
  constraint goals_number_has_target check (
    track_type <> 'number' or (start_value is not null and target_value is not null)
  ),
  constraint goals_not_own_parent check (parent_id is null or parent_id <> id)
);

create index if not exists goals_owner_status_idx on public.goals (owner_id, status, target_date);
create index if not exists goals_parent_idx on public.goals (parent_id) where parent_id is not null;

drop trigger if exists goals_set_updated_at on public.goals;
create trigger goals_set_updated_at
before update on public.goals
for each row execute function public.set_updated_at();

alter table public.goals enable row level security;

drop policy if exists "goals owner all" on public.goals;
create policy "goals owner all"
  on public.goals for all
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "goals reviewer select" on public.goals;
create policy "goals reviewer select"
  on public.goals for select
  using (is_private = false and public.is_reviewer_of(owner_id));

-- ---------------------------------------------------------------------------
-- Steps: the checklist behind a "steps" goal.

create table if not exists public.goal_steps (
  id         uuid primary key default gen_random_uuid(),
  goal_id    uuid not null references public.goals(id) on delete cascade,
  owner_id   uuid not null references public.users(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 200),
  position   integer not null default 0,
  done_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists goal_steps_goal_idx on public.goal_steps (goal_id, position);

alter table public.goal_steps enable row level security;

drop policy if exists "goal_steps owner all" on public.goal_steps;
create policy "goal_steps owner all"
  on public.goal_steps for all
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.goals g
       where g.id = goal_steps.goal_id and g.owner_id = (select auth.uid())
    )
  );

drop policy if exists "goal_steps reviewer select" on public.goal_steps;
create policy "goal_steps reviewer select"
  on public.goal_steps for select
  using (
    exists (
      select 1 from public.goals g
       where g.id = goal_steps.goal_id
         and g.is_private = false
         and public.is_reviewer_of(g.owner_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Check-ins are journal entries with a goal attached.

alter table public.journal_entries
  add column if not exists goal_id  uuid references public.goals(id) on delete set null,
  add column if not exists on_track smallint check (on_track between 1 and 10),
  add column if not exists value    numeric;

create index if not exists journal_entries_goal_idx
  on public.journal_entries (goal_id, entry_date desc) where goal_id is not null;
