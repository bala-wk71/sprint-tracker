-- 20260916000002_tracked_days.sql
-- The "did you actually track this day?" primitive.
--
-- XP used to be awarded per action with no reference to whether the day was
-- logged at all, so ticking todos on the notes page — unlimited, 5 XP each —
-- levelled an account up without a single tracked day. One definition now
-- serves two jobs: gating the awards that aren't themselves an act of
-- tracking, and deciding which days cost XP in the decay walk.
--
-- A day counts as tracked if the user recorded something about that actual
-- day: a check-in or wrap-up, a journal entry they wrote themselves, a
-- workout, a weigh-in, or a meal. Todos, notes and sprint creation are
-- planning or bookkeeping, not tracking, and deliberately do not count.

create or replace function public.day_is_tracked(d date)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    -- A daily_logs row alone is not enough: the row is created as a side
    -- effect of saving priorities or a time entry, so it exists on days the
    -- user never actually checked in. Require a mood or energy value.
    select 1 from public.daily_logs
     where owner_id = auth.uid()
       and log_date = d
       and (morning_mood is not null
         or morning_energy is not null
         or closing_mood is not null)
  ) or exists (
    -- author = 'owner' only. The coach's own letters are written *to* the
    -- user and must never count as the user having shown up.
    select 1 from public.journal_entries
     where owner_id = auth.uid() and entry_date = d and author = 'owner'
  ) or exists (
    select 1 from public.workouts
     where owner_id = auth.uid() and log_date = d
  ) or exists (
    select 1 from public.body_metrics
     where owner_id = auth.uid() and measured_on = d
  ) or exists (
    -- Templates ("usual breakfast") carry no log_date and are not a meal
    -- anyone ate on a given day.
    select 1 from public.meals
     where owner_id = auth.uid() and log_date = d and not is_template
  );
$$;

-- ---------------------------------------------------------------------------
-- gamification_stats v5: adds tracked_dates, the same definition as above in
-- set form, so the decay walk and the dashboard warning can be computed from
-- the single round trip the dashboard already makes. Everything from v4 is
-- carried over unchanged.

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
    ),
    'journal_entries_count', coalesce(
      (select count(*) from public.journal_entries
        where owner_id = auth.uid() and author = 'owner'),
      0
    ),
    'checkins_count', coalesce(
      (select count(*) from public.journal_entries
        where owner_id = auth.uid() and kind = 'check_in'),
      0
    ),
    'goals_done', coalesce(
      (select count(*) from public.goals
        where owner_id = auth.uid() and status = 'done'),
      0
    ),
    'long_view_goals', coalesce(
      (select count(*) from public.goals g
        where g.owner_id = auth.uid()
          and g.target_date - g.start_date >= 365
          and (select max(j.entry_date) - min(j.entry_date)
                 from public.journal_entries j
                where j.goal_id = g.id and j.kind = 'check_in') >= 180),
      0
    ),
    -- v5. Every date the user recorded something about that day, by the same
    -- rule as day_is_tracked(). union already dedupes across the sources.
    'tracked_dates', coalesce(
      (select jsonb_agg(u.d order by u.d) from (
         select log_date as d from public.daily_logs
          where owner_id = auth.uid()
            and (morning_mood is not null
              or morning_energy is not null
              or closing_mood is not null)
         union
         select entry_date from public.journal_entries
          where owner_id = auth.uid() and author = 'owner'
         union
         select log_date from public.workouts where owner_id = auth.uid()
         union
         select measured_on from public.body_metrics where owner_id = auth.uid()
         union
         select log_date from public.meals
          where owner_id = auth.uid() and not is_template and log_date is not null
       ) u),
      '[]'::jsonb
    )
  );
$$;
