-- Phases: a long plan is walked one stretch at a time.
--
--   plan_phases        the stretches of the roadmap ("Foundations", to 31 Dec;
--                      "The Move", 2027…), in order, at most one current
--   goals.phase_id     the phase a short goal belongs to
--   goal_steps.phase_id
--                      on a long-range goal, the phase a step is planned for;
--                      starting that phase turns these into the phase's goals
--   sprints.goal_alignment / alignment_note
--                      how a week lines up with the goals, in one line

-- ---------------------------------------------------------------------------
-- Phases

create table if not exists public.plan_phases (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.users(id) on delete cascade,
  position     smallint not null check (position between 1 and 50),
  name         text not null check (char_length(name) between 1 and 60),
  starts_on    date not null,
  ends_on      date not null,
  status       text not null default 'upcoming' check (status in ('upcoming', 'current', 'done')),
  started_at   timestamptz,
  finished_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint plan_phases_dates_ordered check (ends_on >= starts_on),
  constraint plan_phases_id_owner_key unique (id, owner_id),
  constraint plan_phases_owner_position_key unique (owner_id, position) deferrable initially immediate
);

-- One phase is worked on at a time.
create unique index if not exists plan_phases_one_current
  on public.plan_phases (owner_id) where status = 'current';

drop trigger if exists plan_phases_set_updated_at on public.plan_phases;
create trigger plan_phases_set_updated_at
before update on public.plan_phases
for each row execute function public.set_updated_at();

alter table public.plan_phases enable row level security;

drop policy if exists "plan_phases owner all" on public.plan_phases;
create policy "plan_phases owner all"
  on public.plan_phases for all
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Goals and steps join a phase

alter table public.goals add column if not exists phase_id uuid;
alter table public.goals drop constraint if exists goals_phase_fkey;
alter table public.goals
  add constraint goals_phase_fkey
  foreign key (phase_id, owner_id) references public.plan_phases (id, owner_id)
  on delete set null (phase_id);
create index if not exists goals_phase_idx on public.goals (phase_id) where phase_id is not null;

alter table public.goal_steps add column if not exists phase_id uuid;
alter table public.goal_steps drop constraint if exists goal_steps_phase_fkey;
alter table public.goal_steps
  add constraint goal_steps_phase_fkey
  foreign key (phase_id, owner_id) references public.plan_phases (id, owner_id)
  on delete set null (phase_id);
create index if not exists goal_steps_phase_idx on public.goal_steps (phase_id) where phase_id is not null;

-- ---------------------------------------------------------------------------
-- A sprint says how it lines up with the goals

alter table public.sprints
  add column if not exists goal_alignment text check (goal_alignment in ('aligned', 'partly', 'off')),
  add column if not exists alignment_note text check (char_length(alignment_note) <= 160);
