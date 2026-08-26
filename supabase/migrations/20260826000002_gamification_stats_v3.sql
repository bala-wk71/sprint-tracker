-- 20260826000002_gamification_stats_v3.sql
-- Adds the health counters to gamification_stats() so the achievement ladder
-- can cover training, hydration and weigh-ins. Pure replace of the read-only
-- function; no data change.
--
-- Everything here counts something the database can answer exactly. PR counts
-- are deliberately absent: a personal record is defined by estimated 1RM,
-- which is application arithmetic, and an achievement that disagrees with the
-- badge on the set row would be worse than no achievement at all.

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
    ),
    -- A session only counts once it has a real set in it, so an empty one
    -- started and abandoned earns nothing.
    'workouts_total', coalesce(
      (select count(*) from public.workouts w
        where w.owner_id = auth.uid()
          and exists (
            select 1 from public.workout_sets s
             where s.workout_id = w.id
               and (s.weight_kg is not null or s.reps is not null
                    or s.distance_m is not null or s.duration_sec is not null)
          )),
      0
    ),
    'workout_dates', coalesce(
      (select jsonb_agg(distinct w.log_date order by w.log_date)
         from public.workouts w
        where w.owner_id = auth.uid()
          and exists (
            select 1 from public.workout_sets s
             where s.workout_id = w.id
               and (s.weight_kg is not null or s.reps is not null
                    or s.distance_m is not null or s.duration_sec is not null)
          )),
      '[]'::jsonb
    ),
    'working_sets_total', coalesce(
      (select count(*) from public.workout_sets
        where owner_id = auth.uid() and not is_warmup
          and weight_kg is not null and reps is not null),
      0
    ),
    -- Days the water goal was actually reached, against whatever the goal was
    -- when this runs. Defaults to 3000ml for a user with no profile row.
    'water_goal_days', coalesce(
      (select count(*) from (
         select w.log_date, sum(w.amount_ml) as total
           from public.water_logs w
          where w.owner_id = auth.uid()
          group by w.log_date
       ) days
       where days.total >= coalesce(
         (select daily_water_ml_goal from public.health_profiles
           where owner_id = auth.uid()),
         3000
       )),
      0
    ),
    'weigh_in_count', coalesce(
      (select count(*) from public.body_metrics
        where owner_id = auth.uid() and weight_kg is not null),
      0
    ),
    'food_days', coalesce(
      (select count(distinct m.log_date)
         from public.meals m
        where m.owner_id = auth.uid()
          and not m.is_template
          and exists (
            select 1 from public.meal_items i where i.meal_id = m.id
          )),
      0
    )
  );
$$;
