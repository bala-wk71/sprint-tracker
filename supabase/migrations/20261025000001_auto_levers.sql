-- Goal actions that count themselves from Health, and quick-logged workouts.
--
-- The roadmap import left nutrition and sport actions as manual ticks even
-- though the meal and workout logs already hold the answer, so they asked for
-- the same thing twice and went unticked. These sources read the logs instead.

-- ---------------------------------------------------------------------------
-- Workouts: what kind of session, and a length for quick logs.
--
-- A quick log from the evening wrap-up ("Push day, 50 min") has no sets and no
-- start or end time, so its length is stored directly.

alter table public.workouts
  add column if not exists activity text
    check (activity in ('strength', 'cardio', 'walk', 'sport', 'other')),
  add column if not exists duration_min smallint
    check (duration_min between 1 and 600);

-- Existing sessions: all-cardio sets are cardio (walking ones are walks), any
-- other set makes it a strength session. Sessions with no sets stay unknown.
update public.workouts w
   set activity = case
     when exists (
       select 1 from public.workout_sets s
         join public.exercises e on e.id = s.exercise_id
        where s.workout_id = w.id and e.muscle_group <> 'cardio'
     ) then 'strength'
     when exists (
       select 1 from public.workout_sets s
         join public.exercises e on e.id = s.exercise_id
        where s.workout_id = w.id and e.name ilike 'walk%'
     ) then 'walk'
     else 'cardio'
   end
 where w.activity is null
   and exists (select 1 from public.workout_sets s where s.workout_id = w.id);

-- ---------------------------------------------------------------------------
-- Lever sources.
--
--   strength / cardio / sport  sessions of that activity (cardio includes walks)
--   protein_days               days the meals reach the Health protein target
--   kcal_days                  days the meals land within 10% of the kcal target

alter table public.goal_levers drop constraint if exists goal_levers_source_check;
alter table public.goal_levers
  add constraint goal_levers_source_check check (source in (
    'tick', 'workouts', 'strength', 'cardio', 'sport',
    'protein_days', 'kcal_days', 'linked_hours'
  ));

-- Move the obvious manual ones over. Their old ticks stay in lever_ticks but
-- are no longer read: from now on the logs are the record.
update public.goal_levers set source = 'protein_days'
 where source = 'tick' and title ~* 'protein';
update public.goal_levers set source = 'kcal_days'
 where source = 'tick' and title ~* '(calorie|kcal)';
update public.goal_levers set source = 'cardio'
 where source = 'tick' and title ~* '(walk|run|jog|cardio|cycl)';
update public.goal_levers set source = 'sport'
 where source = 'workouts' and title ~* '(football|sport|cricket|badminton|tennis|basketball)';
update public.goal_levers set source = 'strength'
 where source = 'workouts' and title ~* '(strength|gym|weights|lifting)';

-- ---------------------------------------------------------------------------
-- Goals: a goal past its end date can be extended once from the wrap-up.

alter table public.goals
  add column if not exists extended_at timestamptz;
