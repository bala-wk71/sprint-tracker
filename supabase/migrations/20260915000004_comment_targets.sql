-- 20260915000004_comment_targets.sql
-- Reviewers can comment on shared goals and journal entries.
--
-- On its own because Postgres won't let a new enum value be used in the same
-- transaction that adds it; the policies that reference these values live in
-- the next migration.

alter type public.comment_target_type add value if not exists 'goal';
alter type public.comment_target_type add value if not exists 'journal_entry';
