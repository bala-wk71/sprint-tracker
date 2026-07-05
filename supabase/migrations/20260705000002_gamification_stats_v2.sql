-- 016_gamification_stats_v2.sql
-- Adds perfect_days and todos_done to gamification_stats() for the expanded
-- achievement ladders. Pure replace of the read-only function; no data change.

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
    ),
    -- Mirrors the perfect-day XP condition in daily actions:
    -- check-in (mood or energy) + closing mood + at least one time entry.
    'perfect_days', coalesce(
      (select count(*)
         from public.daily_logs d
        where d.owner_id = auth.uid()
          and (d.morning_mood is not null or d.morning_energy is not null)
          and d.closing_mood is not null
          and exists (
            select 1 from public.time_entries te
             where te.daily_log_id = d.id
          )),
      0
    ),
    'todos_done', coalesce(
      (select count(*) from public.todo_tasks
        where owner_id = auth.uid() and is_completed),
      0
    )
  );
$$;
