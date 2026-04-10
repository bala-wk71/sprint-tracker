-- 005_daily_logs.sql
-- Per-day journal: morning check-in + evening wrap-up + child rows for
-- top-3 priorities and time entries. Privacy is enforced per-row via the
-- *_private flags so that reviewers can be filtered by RLS.

create type public.mood as enum (
  'energized',
  'focused',
  'neutral',
  'tired',
  'stressed'
);

create type public.priority_status as enum ('pending', 'done', 'partial', 'missed');

create table if not exists public.daily_logs (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.users(id) on delete cascade,
  sprint_id           uuid references public.sprints(id) on delete set null,
  log_date            date not null,
  -- morning check-in
  morning_mood        public.mood,
  morning_energy      smallint check (morning_energy between 1 and 10),
  daily_intention     text,  -- 280 char limit enforced in app
  -- evening wrap-up
  closing_mood        public.mood,
  productivity_rating smallint check (productivity_rating between 1 and 10),
  reflection          text,
  reflection_private  boolean not null default false,
  improvement         text,
  win                 text,
  gratitude           text,
  gratitude_private   boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint daily_logs_owner_date_unique unique (owner_id, log_date)
);

create index if not exists daily_logs_owner_idx on public.daily_logs (owner_id);
create index if not exists daily_logs_sprint_idx on public.daily_logs (sprint_id);
create index if not exists daily_logs_date_idx on public.daily_logs (log_date);

drop trigger if exists daily_logs_set_updated_at on public.daily_logs;
create trigger daily_logs_set_updated_at
before update on public.daily_logs
for each row execute function public.set_updated_at();

create table if not exists public.priorities (
  id            uuid primary key default gen_random_uuid(),
  daily_log_id  uuid not null references public.daily_logs(id) on delete cascade,
  position      smallint not null check (position between 1 and 3),
  description   text not null,
  target_hours  numeric(5, 2) not null default 0,
  status        public.priority_status not null default 'pending',
  created_at    timestamptz not null default now(),
  constraint priorities_log_position_unique unique (daily_log_id, position)
);

create index if not exists priorities_log_idx on public.priorities (daily_log_id);

create table if not exists public.time_entries (
  id            uuid primary key default gen_random_uuid(),
  daily_log_id  uuid not null references public.daily_logs(id) on delete cascade,
  owner_id      uuid not null references public.users(id) on delete cascade,
  task_id       uuid references public.tasks(id) on delete set null,
  start_time    time,
  duration_hours numeric(5, 2) not null check (duration_hours > 0),
  energy_during smallint check (energy_during between 1 and 5),
  notes         text,
  is_private    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists time_entries_log_idx on public.time_entries (daily_log_id);
create index if not exists time_entries_task_idx on public.time_entries (task_id);
create index if not exists time_entries_owner_idx on public.time_entries (owner_id);

drop trigger if exists time_entries_set_updated_at on public.time_entries;
create trigger time_entries_set_updated_at
before update on public.time_entries
for each row execute function public.set_updated_at();

alter table public.daily_logs   enable row level security;
alter table public.priorities   enable row level security;
alter table public.time_entries enable row level security;
