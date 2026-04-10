-- 007_recurring_templates.sql
-- Templates for tasks that recur week to week. When a new sprint is set
-- up, the user can pull recurring templates in as concrete tasks.

create table if not exists public.recurring_templates (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.users(id) on delete cascade,
  name          text not null,
  category      public.task_category not null,
  target_hours  numeric(5, 2) not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists recurring_templates_owner_idx
  on public.recurring_templates (owner_id);

drop trigger if exists recurring_templates_set_updated_at on public.recurring_templates;
create trigger recurring_templates_set_updated_at
before update on public.recurring_templates
for each row execute function public.set_updated_at();

-- Wire up the FK that tasks.template_id was waiting for.
alter table public.tasks
  add constraint tasks_template_id_fkey
  foreign key (template_id)
  references public.recurring_templates(id)
  on delete set null;

alter table public.recurring_templates enable row level security;
