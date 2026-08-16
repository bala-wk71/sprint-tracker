-- 20260815000002_week_start_day.sql
-- Per-user "week starts on" preference.
--
-- Sprints are keyed by `week_start_date` and every screen that reads them
-- (dashboard, daily, analytics, streaks, the AI context) derived that date by
-- snapping today to Monday. A user whose sprint week starts on Wednesday could
-- create the sprint — the date picker accepts any day — but nothing found it
-- afterwards, because the lookups asked for the Monday. This column is the
-- single source of truth those helpers now snap to.
--
-- 0 = Sunday … 6 = Saturday, matching JS getDay() and date-fns weekStartsOn.
alter table public.users
  add column if not exists week_start_day smallint not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_week_start_day_range'
  ) then
    alter table public.users
      add constraint users_week_start_day_range
      check (week_start_day between 0 and 6);
  end if;
end
$$;

-- Backfill from what people already do.
--
-- The setup form let anyone file a sprint on any weekday, so users running a
-- Wednesday-to-Tuesday week already have Wednesday-dated sprints — they just
-- had nothing reading them back. Seed each user's preference from the weekday
-- most of their sprints start on, so those weeks light up without anyone
-- having to find the new setting first. Monday users keep the default.
with preferred as (
  select
    owner_id,
    extract(dow from week_start_date)::smallint as day,
    row_number() over (
      partition by owner_id
      order by count(*) desc, max(week_start_date) desc
    ) as rank
  from public.sprints
  group by owner_id, extract(dow from week_start_date)
)
update public.users u
set week_start_day = preferred.day
from preferred
where preferred.owner_id = u.id
  and preferred.rank = 1
  and preferred.day <> 1;
