-- 004_sprints_tasks.sql
-- Weekly sprints owned by a single user, plus the tasks planned for that
-- sprint. Each task has a Signal/Noise category and a target hours value.

create type public.task_category as enum (
  'strong_signal',
  'weak_signal',
  'strong_noise',
  'weak_noise',
  'personal'
);

create table if not exists public.sprints (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references public.users(id) on delete cascade,
  week_start_date   date not null,
  notes             text,
  -- weekly reflection (filled out at end of sprint)
  reflection_went_well   text,
  reflection_improve     text,
  reflection_lesson      text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint sprints_owner_week_unique unique (owner_id, week_start_date)
);

create index if not exists sprints_owner_idx on public.sprints (owner_id);
create index if not exists sprints_week_idx on public.sprints (week_start_date);

drop trigger if exists sprints_set_updated_at on public.sprints;
create trigger sprints_set_updated_at
before update on public.sprints
for each row execute function public.set_updated_at();

create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  sprint_id     uuid not null references public.sprints(id) on delete cascade,
  owner_id      uuid not null references public.users(id) on delete cascade,
  name          text not null,
  category      public.task_category not null,
  target_hours  numeric(5, 2) not null default 0,
  is_recurring  boolean not null default false,
  template_id   uuid,  -- FK added in 007_recurring_templates.sql
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists tasks_sprint_idx on public.tasks (sprint_id);
create index if not exists tasks_owner_idx on public.tasks (owner_id);

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

alter table public.sprints enable row level security;
alter table public.tasks   enable row level security;
