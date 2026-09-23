-- 20260923000001_craft.sql
-- Craft: deliberate practice at engineering judgment.
--
-- Two halves, deliberately kept apart because they move at different speeds:
--   craft_runs     — one rigor checklist per todo task. High churn, daily.
--   craft_reading  — progress through the foundations curriculum. Read once.
--
-- Personal feature, like todo — no reviewer access, plain owner_id RLS.

create table if not exists public.craft_runs (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.users(id) on delete cascade,
  -- Rigor hangs off the task you were already going to do, rather than a
  -- parallel list of its own: a second list is a second thing to keep in sync,
  -- and it would be abandoned within a week.
  task_id       uuid not null unique references public.todo_tasks(id) on delete cascade,
  -- Ticked checklist item ids, e.g. {"f1": true, "p2": true}. A bag rather than
  -- rows because the template lives in code (lib/craft/checklist.ts) and is
  -- meant to be edited as you learn what you keep getting wrong. A run keeps
  -- whatever it ticked; items later dropped from the template stop counting.
  ticks         jsonb not null default '{}'::jsonb,
  -- Written at completion: what surprised you, what your lead would have done
  -- differently. The whole point of the exercise, so it lives on the run.
  lesson        text check (lesson is null or char_length(lesson) <= 4000),
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- The timer strip wants "the run I last touched that is still open".
create index if not exists craft_runs_owner_open_idx
  on public.craft_runs (owner_id, updated_at desc)
  where completed_at is null;

-- History and the "done right" count.
create index if not exists craft_runs_owner_done_idx
  on public.craft_runs (owner_id, completed_at desc)
  where completed_at is not null;

drop trigger if exists craft_runs_set_updated_at on public.craft_runs;
create trigger craft_runs_set_updated_at
before update on public.craft_runs
for each row execute function public.set_updated_at();

alter table public.craft_runs enable row level security;

drop policy if exists "craft_runs owner all" on public.craft_runs;
create policy "craft_runs owner all"
  on public.craft_runs for all
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------

create table if not exists public.craft_reading (
  owner_id    uuid not null references public.users(id) on delete cascade,
  -- Slug from lib/craft/curriculum.ts. Not a foreign key: the curriculum is
  -- code, and retiring a topic should leave its history behind, not cascade.
  topic_slug  text not null check (char_length(topic_slug) between 1 and 64),
  status      text not null default 'reading' check (status in ('reading', 'read')),
  -- Your own words on the topic — the part that makes it stick.
  notes       text check (notes is null or char_length(notes) <= 8000),
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (owner_id, topic_slug)
);

drop trigger if exists craft_reading_set_updated_at on public.craft_reading;
create trigger craft_reading_set_updated_at
before update on public.craft_reading
for each row execute function public.set_updated_at();

alter table public.craft_reading enable row level security;

drop policy if exists "craft_reading owner all" on public.craft_reading;
create policy "craft_reading owner all"
  on public.craft_reading for all
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Ticking a box is a read-modify-write on a jsonb column, which two open tabs
-- can lose. Doing the merge in one statement makes that impossible, rather
-- than unlikely — the same argument the curriculum's transactions topic makes.
-- `owner_id = auth.uid()` is belt and braces over RLS, which also applies.

create or replace function public.craft_set_tick(
  p_task_id uuid,
  p_item    text,
  p_value   boolean
)
returns public.craft_runs
language sql
security invoker
set search_path = public
as $$
  update public.craft_runs
     set ticks = ticks || jsonb_build_object(p_item, p_value)
   where task_id = p_task_id
     and owner_id = (select auth.uid())
     and completed_at is null
  returning *;
$$;
