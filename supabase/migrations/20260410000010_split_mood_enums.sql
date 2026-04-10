-- 010_split_mood_enums.sql
-- Replace single `mood` enum with separate morning/evening enums that
-- match lib/constants.ts. The original enum values didn't match the PRD
-- vocabulary; this aligns the DB with the constants used in the UI.
--
-- Safe to drop & recreate the columns: daily_logs has zero rows so far.

alter table public.daily_logs drop column if exists morning_mood;
alter table public.daily_logs drop column if exists closing_mood;

drop type if exists public.mood;

create type public.morning_mood as enum (
  'energised',
  'neutral',
  'tired',
  'stressed',
  'pumped'
);

create type public.evening_mood as enum (
  'accomplished',
  'okay',
  'exhausted',
  'frustrated',
  'proud'
);

alter table public.daily_logs
  add column morning_mood public.morning_mood,
  add column closing_mood public.evening_mood;
