-- Goal types: every goal is one of three kinds, and each brings its own
-- tracking so nothing has to be set up by hand.
--
--   number  "Target"      one number from here to there by a date, read from
--                         Health, a loan's EMIs, or entered monthly
--                         (one goal_measures row with its checkpoints)
--   habit   "Habit"       done so many times a week, counted from the logs
--                         (one goal_levers row)
--   steps   "Milestones"  a list of things to get done (goal_steps)
--
-- 'feeling' stays legal for goals made before the types; it is no longer offered.
--
-- Sprints now say how they line up with the goals per task (tasks.goal_id),
-- so the one-line sprint answer goes.

alter table public.goals drop constraint if exists goals_track_type_check;
alter table public.goals
  add constraint goals_track_type_check check (track_type in ('steps', 'number', 'habit', 'feeling'));

-- A Target keeps its number in its measure, not on the goal row.
alter table public.goals drop constraint if exists goals_number_has_target;

alter table public.sprints
  drop column if exists goal_alignment,
  drop column if exists alignment_note;
