-- 20260815000001_todo_section_archive.sql
-- Archiving for todo sections.
--
-- Sections created from a note page pile up: one per page, and once every
-- action item on them is ticked off the only way to clear the board was to
-- delete the section (taking its finished tasks with it). Archiving retires a
-- section without destroying the history — it drops out of the Tasks tab and
-- reappears in its own Archived tab, restorable at any time.

alter table public.todo_sections
  add column if not exists archived_at timestamptz;

-- The Tasks tab filters on (owner, not archived) on every load.
create index if not exists todo_sections_archived_idx
  on public.todo_sections (owner_id, archived_at);

-- Per-user switch for the automatic half of the feature: when the last open
-- task in a note-created section is completed, the section archives itself.
-- Manual archiving stays available either way.
alter table public.users
  add column if not exists todo_auto_archive boolean not null default true;
