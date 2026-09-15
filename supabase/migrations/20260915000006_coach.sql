-- 20260915000006_coach.sql
-- The coach learns to read goals and the journal.
--
-- Reading journal text is opt-in: people write more honestly when they know
-- who is reading. Until the user turns this on, goal reviews and look-backs
-- use numbers, steps and ratings only.

alter table public.users
  add column if not exists coach_reads_journal boolean not null default false;

-- ---------------------------------------------------------------------------
-- Saved "How am I doing?" reviews, so this month's reading can be compared
-- with last month's. One per goal per week keeps AI cost bounded; the app
-- checks the latest created_at before generating a new one.

create table if not exists public.goal_reviews (
  id           uuid primary key default gen_random_uuid(),
  goal_id      uuid not null references public.goals(id) on delete cascade,
  owner_id     uuid not null references public.users(id) on delete cascade,
  direction    text not null check (direction in ('forward', 'steady', 'slipping', 'unclear')),
  summary      text not null check (char_length(summary) <= 2000),
  -- [{ "text": "...", "dates": "2 Aug → 12 Sep" }, ...]
  reasons      jsonb not null default '[]'::jsonb,
  next_step    text not null default '' check (char_length(next_step) <= 1000),
  -- What the review looked at, e.g. { "checkins": 6, "entries": 3, "hours": 11.5 }
  input_counts jsonb not null default '{}'::jsonb,
  read_journal boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists goal_reviews_goal_idx
  on public.goal_reviews (goal_id, created_at desc);

alter table public.goal_reviews enable row level security;

-- Reviews are the owner's own reading of their progress; reviewers don't see them.
drop policy if exists "goal_reviews owner all" on public.goal_reviews;
create policy "goal_reviews owner all"
  on public.goal_reviews for all
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.goals g
       where g.id = goal_reviews.goal_id and g.owner_id = (select auth.uid())
    )
  );
