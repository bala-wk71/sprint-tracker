-- 20260920000001_plan_reports.sql
-- Written plan reports: the monthly report, quarterly review and yearly
-- review. See docs/GOAL_PLANNING_PLAN.md §6.
--
-- The numbers are computed by code and kept as they were on the day (so a
-- month can be compared with the last one); the words are the AI's. Weekly
-- checks are pure numbers and are recomputed on demand, never stored.
-- Owner-only: reports mix every stream, including private goals.

create table if not exists public.plan_reports (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.users(id) on delete cascade,
  period        text not null check (period in ('month', 'quarter', 'year')),
  period_start  date not null,
  period_end    date not null,
  -- The last day the numbers ran to: the period's end, or the day it was written.
  as_of         date not null,
  numbers       jsonb not null,
  -- { headline, streams: [{ name, summary, nextFocus }], nextFocus }
  words         jsonb not null,
  -- Quarterly reviews: next quarter's goals and projects, as a plan draft.
  proposal      jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint plan_reports_period_order check (period_start <= period_end and as_of >= period_start),
  constraint plan_reports_one_per_period unique (owner_id, period, period_start)
);

create index if not exists plan_reports_owner_idx on public.plan_reports (owner_id, period, period_start desc);

drop trigger if exists plan_reports_set_updated_at on public.plan_reports;
create trigger plan_reports_set_updated_at
before update on public.plan_reports
for each row execute function public.set_updated_at();

alter table public.plan_reports enable row level security;

drop policy if exists "plan_reports owner all" on public.plan_reports;
create policy "plan_reports owner all"
  on public.plan_reports for all
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
