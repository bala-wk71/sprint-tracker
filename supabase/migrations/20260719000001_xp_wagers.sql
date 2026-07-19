-- 017_xp_wagers.sql
-- Opt-in weekly XP wagers: stake XP on logging all 7 days of a week.
-- The stake is escrowed as a negative xp_events row when placed
-- (dedupe 'wager_stake:<week_start>'); a win appends a positive row
-- (dedupe 'wager_win:<week_start>') worth stake + bonus. The ledger stays
-- append-only — a lost wager simply never gets a win row.

create table if not exists public.xp_wagers (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.users(id) on delete cascade,
  week_start  date not null,
  stake       integer not null check (stake > 0),
  status      text not null default 'active' check (status in ('active', 'won', 'lost')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  unique (owner_id, week_start)
);

create index if not exists xp_wagers_owner_idx on public.xp_wagers (owner_id);

alter table public.xp_wagers enable row level security;

create policy "owner_all_xp_wagers" on public.xp_wagers
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
