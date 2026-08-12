-- 20260812000001_notes.sql
-- Meeting notes workspace: a tree of pages (company > project > feature > notes)
-- whose action items become rows in the existing todo tables.
-- Personal feature — no reviewer access, simple owner_id = auth.uid() RLS.

create table if not exists public.note_pages (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.users(id) on delete cascade,
  parent_id     uuid references public.note_pages(id) on delete cascade,
  title         text not null default 'Untitled',
  icon          text,
  kind          text not null default 'page' check (kind in ('page', 'meeting')),
  -- `body` is the user's own markdown and is never overwritten by the AI;
  -- `enhanced_body` holds the AI clean-up and is regenerated on demand.
  body          text not null default '',
  enhanced_body text,
  transcript    text,
  meeting_date  date,
  attendees     text,
  position      integer not null default 0,
  is_archived   boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  search_vector tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))
  ) stored
);

create index if not exists note_pages_owner_idx    on public.note_pages (owner_id, is_archived);
create index if not exists note_pages_parent_idx   on public.note_pages (parent_id);
create index if not exists note_pages_search_idx   on public.note_pages using gin (search_vector);

drop trigger if exists note_pages_set_updated_at on public.note_pages;
create trigger note_pages_set_updated_at
before update on public.note_pages
for each row execute function public.set_updated_at();

alter table public.note_pages enable row level security;

create policy "owner_all_note_pages" on public.note_pages
  for all using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Link the todo tree back to the page an item came from.
--
-- A page-derived task keeps living in todo_tasks, so it keeps XP, the
-- Completed tab, search and reordering for free. `source_page_id` on
-- todo_sections is what makes "find or create the section for this page"
-- idempotent — one section per page, never a duplicate.

alter table public.todo_tasks
  add column if not exists source_page_id uuid references public.note_pages(id) on delete set null,
  add column if not exists due_date date;

alter table public.todo_sections
  add column if not exists source_page_id uuid references public.note_pages(id) on delete set null;

create index if not exists todo_tasks_source_page_idx
  on public.todo_tasks (source_page_id) where source_page_id is not null;

create unique index if not exists todo_sections_source_page_key
  on public.todo_sections (owner_id, source_page_id) where source_page_id is not null;
