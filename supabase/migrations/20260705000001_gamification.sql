-- 015_gamification.sql
-- XP ledger + unlocked achievements. Owner-only, same RLS shape as todo.
-- XP awards are idempotent via dedupe_key (e.g. 'checkin:2026-07-05',
-- 'priority:<uuid>'), so retried actions never double-award.

create table if not exists public.xp_events (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.users(id) on delete cascade,
  amount     integer not null,
  reason     text not null,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, dedupe_key)
);

create index if not exists xp_events_owner_idx on public.xp_events (owner_id);

alter table public.xp_events enable row level security;

create policy "owner_all_xp_events" on public.xp_events
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------

create table if not exists public.user_achievements (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.users(id) on delete cascade,
  achievement_id text not null,
  unlocked_at    timestamptz not null default now(),
  unique (owner_id, achievement_id)
);

create index if not exists user_achievements_owner_idx
  on public.user_achievements (owner_id);

alter table public.user_achievements enable row level security;

create policy "owner_all_achievements" on public.user_achievements
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Aggregates used by the XP summary and achievement checks; a single RPC
-- instead of several wide row fetches.

create or replace function public.total_xp()
returns bigint
language sql stable
set search_path = public
as $$
  select coalesce(sum(amount), 0)::bigint
  from public.xp_events
  where owner_id = auth.uid();
$$;

create or replace function public.gamification_stats()
returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'log_dates', coalesce(
      (select jsonb_agg(log_date order by log_date)
         from public.daily_logs where owner_id = auth.uid()),
      '[]'::jsonb
    ),
    'total_hours', coalesce(
      (select sum(duration_hours) from public.time_entries
        where owner_id = auth.uid()),
      0
    ),
    'priorities_done', coalesce(
      (select count(*)
         from public.priorities p
         join public.daily_logs d on d.id = p.daily_log_id
        where d.owner_id = auth.uid() and p.status = 'done'),
      0
    ),
    'sprints_count', coalesce(
      (select count(*) from public.sprints where owner_id = auth.uid()),
      0
    ),
    'reflections_count', coalesce(
      (select count(*) from public.sprints
        where owner_id = auth.uid()
          and reflection_went_well is not null
          and reflection_went_well <> ''),
      0
    )
  );
$$;
