-- Limits on goals: a week only has so many hours, and only a few fronts can
-- be pushed at once.
--
--   streams.focus  'push' (at most three at a time) or 'maintain' (an hours
--                  floor, no new short goals)
--   time_budgets   what the week holds before any stream: sleep, the job and
--                  everyday overhead. Stream hours have to fit in the rest.

-- ---------------------------------------------------------------------------
-- Push or maintain

alter table public.streams
  add column if not exists focus text not null default 'maintain'
    check (focus in ('push', 'maintain'));

-- Enforced here as well as in the app, so no path (an import, a second tab)
-- can end up with a fourth push stream.
create or replace function public.streams_push_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.focus = 'push' and new.archived_at is null and (
    select count(*) from public.streams s
     where s.owner_id = new.owner_id
       and s.focus = 'push'
       and s.archived_at is null
       and s.id <> new.id
  ) >= 3 then
    raise exception 'push_limit' using errcode = 'check_violation', hint = 'At most three push streams at a time.';
  end if;
  return new;
end;
$$;

drop trigger if exists streams_push_limit on public.streams;
create trigger streams_push_limit
before insert or update of focus, archived_at on public.streams
for each row execute function public.streams_push_limit();

-- ---------------------------------------------------------------------------
-- The week before any stream

create table if not exists public.time_budgets (
  owner_id        uuid primary key references public.users(id) on delete cascade,
  -- Per night.
  sleep_hours     numeric(3, 1) not null default 8 check (sleep_hours between 0 and 14),
  -- Per week: the day job, a fixed block rather than a goal.
  job_hours       numeric(4, 1) not null default 40 check (job_hours between 0 and 100),
  -- Per week: commute, meals, chores, the things that happen anyway.
  overhead_hours  numeric(4, 1) not null default 21 check (overhead_hours between 0 and 100),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists time_budgets_set_updated_at on public.time_budgets;
create trigger time_budgets_set_updated_at
before update on public.time_budgets
for each row execute function public.set_updated_at();

alter table public.time_budgets enable row level security;

drop policy if exists "time_budgets owner all" on public.time_budgets;
create policy "time_budgets owner all"
  on public.time_budgets for all
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
