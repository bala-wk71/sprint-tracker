-- 20260916000003_xp_earned_on.sql
-- Which day an XP award belongs to, so awards can be capped per day.
--
-- created_at cannot answer this. It is a timestamptz written in UTC, while
-- "today" for the user is whatever todayIsoLocal() resolves from their
-- x-vercel-ip-timezone header — ~5h30m ahead of UTC for IST. Counting a day's
-- awards off created_at would put an evening's todos on the wrong side of
-- midnight and hand out a fresh cap mid-session.
--
-- Nullable-then-backfill rather than a default on add: existing rows get the
-- UTC date of their created_at, which is the best available guess for history
-- written before the column existed, and new rows always pass the value
-- explicitly from the caller's local date.

alter table public.xp_events
  add column if not exists earned_on date;

update public.xp_events
   set earned_on = (created_at at time zone 'utc')::date
 where earned_on is null;

alter table public.xp_events
  alter column earned_on set default current_date;

alter table public.xp_events
  alter column earned_on set not null;

-- Serves the per-day cap lookup: "how much todo_done has this user already
-- earned on this date?"
create index if not exists xp_events_owner_reason_day_idx
  on public.xp_events (owner_id, reason, earned_on);
