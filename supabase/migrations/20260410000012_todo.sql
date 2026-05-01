-- 012_todo.sql
-- Todo feature: sections (with one-level subsections) and tasks.
-- Personal feature — no reviewer access needed, simple owner_id = auth.uid() RLS.

create table if not exists public.todo_sections (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.users(id) on delete cascade,
  parent_id    uuid references public.todo_sections(id) on delete cascade,
  name         text not null,
  position     integer not null default 0,
  is_collapsed boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists todo_sections_owner_idx  on public.todo_sections (owner_id);
create index if not exists todo_sections_parent_idx on public.todo_sections (parent_id);

drop trigger if exists todo_sections_set_updated_at on public.todo_sections;
create trigger todo_sections_set_updated_at
before update on public.todo_sections
for each row execute function public.set_updated_at();

alter table public.todo_sections enable row level security;

create policy "owner_all_sections" on public.todo_sections
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------

create table if not exists public.todo_tasks (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.users(id) on delete cascade,
  section_id   uuid not null references public.todo_sections(id) on delete cascade,
  title        text not null,
  description  text,
  is_completed boolean not null default false,
  completed_at timestamptz,
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists todo_tasks_owner_idx     on public.todo_tasks (owner_id);
create index if not exists todo_tasks_section_idx   on public.todo_tasks (section_id);
create index if not exists todo_tasks_completed_idx on public.todo_tasks (owner_id, is_completed);

drop trigger if exists todo_tasks_set_updated_at on public.todo_tasks;
create trigger todo_tasks_set_updated_at
before update on public.todo_tasks
for each row execute function public.set_updated_at();

alter table public.todo_tasks enable row level security;

create policy "owner_all_tasks" on public.todo_tasks
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
