-- 20260915000001_journal.sql
-- Journal: free-form entries written whenever, read back later alongside the
-- daily and weekly reflections that already exist.
--
-- Privacy is per ROW here, not per column. daily_logs marks reflection and
-- gratitude private with flags that RLS cannot enforce (reviewers can still
-- select the text; only the UI blanks it). A private journal entry is simply
-- not returned to a reviewer at all.

create table if not exists public.journal_entries (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.users(id) on delete cascade,
  entry_date      date not null default current_date,
  title           text not null default '' check (char_length(title) <= 200),
  body            text not null check (char_length(body) between 1 and 20000),
  mood            text check (mood in ('great', 'good', 'okay', 'low', 'rough')),
  -- entry: written by the user. check_in: a goal check-in (goal link added
  -- with goals). look_back: the coach's monthly letter.
  kind            text not null default 'entry' check (kind in ('entry', 'check_in', 'look_back')),
  author          text not null default 'owner' check (author in ('owner', 'coach')),
  is_private      boolean not null default true,
  hide_from_coach boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  search_vector   tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))
  ) stored
);

create index if not exists journal_entries_owner_date_idx
  on public.journal_entries (owner_id, entry_date desc, created_at desc);
create index if not exists journal_entries_search_idx
  on public.journal_entries using gin (search_vector);

drop trigger if exists journal_entries_set_updated_at on public.journal_entries;
create trigger journal_entries_set_updated_at
before update on public.journal_entries
for each row execute function public.set_updated_at();

alter table public.journal_entries enable row level security;

drop policy if exists "journal_entries owner all" on public.journal_entries;
create policy "journal_entries owner all"
  on public.journal_entries for all
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Reviewers see only entries the owner chose to share.
drop policy if exists "journal_entries reviewer select" on public.journal_entries;
create policy "journal_entries reviewer select"
  on public.journal_entries for select
  using (is_private = false and public.is_reviewer_of(owner_id));
