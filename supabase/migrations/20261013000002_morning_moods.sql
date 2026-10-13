-- 20261013000002_morning_moods.sql
-- Morning mood words that are about mood.
--
-- The check-in asks for mood and, separately, for energy on a 1-10 slider.
-- Three of the five original moods (energised, tired, pumped) were energy
-- words, so the two questions overlapped. These are the feelings the picker
-- offers now. The old values stay in the type: days already logged keep
-- what they said, and the app simply stops offering them.

alter type public.morning_mood add value if not exists 'calm';
alter type public.morning_mood add value if not exists 'content';
alter type public.morning_mood add value if not exists 'focused';
alter type public.morning_mood add value if not exists 'hopeful';
alter type public.morning_mood add value if not exists 'anxious';
alter type public.morning_mood add value if not exists 'low';
alter type public.morning_mood add value if not exists 'irritable';
