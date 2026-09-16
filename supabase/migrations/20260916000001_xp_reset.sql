-- 20260916000001_xp_reset.sql
-- Reset every user's XP to zero. Announced to the user base beforehand.
--
-- Compensating negative rows rather than `delete from public.xp_events`: the
-- unique (owner_id, dedupe_key) index is what makes every award idempotent.
-- Wiping the history would make every past action re-awardable — re-saving an
-- old evening wrap-up, re-ticking an old todo, and awardTimeLogXp()'s prefix
-- scan for a day's prior accrual all depend on those rows still existing.
-- A compensating row zeroes the total while keeping the past un-re-earnable,
-- and leaves an auditable trail of exactly what was cancelled. It is also the
-- shape already used for wager stakes, so the ledger stays append-only.
--
-- total_xp() is a plain sum(amount), so every surface (dashboard hero, sidebar
-- level chip, wager affordability) reads zero with no application change.
--
-- Deliberately untouched: user_achievements, and every other table. Badges
-- record things people actually did, so they stay unlocked — 'level-5' reading
-- as earned while the level shows 1 is correct, they did reach it once.

insert into public.xp_events (owner_id, amount, reason, dedupe_key)
select owner_id, -sum(amount), 'reset', 'reset:2026-09-16'
  from public.xp_events
 group by owner_id
having sum(amount) <> 0
on conflict (owner_id, dedupe_key) do nothing;

-- An active wager escrowed its stake as a negative row, which the zeroing
-- above has just folded in. Settling it later would credit stake + 50% against
-- a stake that no longer exists, so cancel anything in flight. The escrow rows
-- themselves stay as history; only the open bet is withdrawn.
delete from public.xp_wagers where status = 'active';
