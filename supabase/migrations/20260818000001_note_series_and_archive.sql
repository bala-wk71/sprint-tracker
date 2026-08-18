-- 20260818000001_note_series_and_archive.sql
--
-- Two changes to the notes workspace.
--
-- 1. Meeting series.
--
--    A recurring meeting -- a daily scrum, a weekly review -- is not one page.
--    It is a container holding one dated sitting after another. Until now the
--    only way to express that was to nest subpages inside a meeting, which
--    said nothing: a subpage of "Daily Scrum" was neither another scrum nor
--    part of the first one.
--
--    A `series` is that container. It carries no notes of its own; it holds
--    `meeting` occurrences, each with its own date. The shape deliberately
--    mirrors the todo tree its items land in:
--
--        series      ->  top-level todo section
--        occurrence  ->  subsection
--        action item ->  task
--
--    A `meeting` becomes a leaf. Nothing nests inside one sitting.
--
-- 2. Archiving.
--
--    `is_archived` shipped with the original table but nothing ever set it.
--    It becomes a derived flag over a real `archived_at` timestamp, so the
--    archive can show when a page was retired and the two can never disagree.

-- ---------------------------------------------------------------------------
-- kind
-- ---------------------------------------------------------------------------

alter table public.note_pages drop constraint if exists note_pages_kind_check;
alter table public.note_pages
  add constraint note_pages_kind_check
  check (kind in ('page', 'meeting', 'series'));

-- ---------------------------------------------------------------------------
-- archived_at
-- ---------------------------------------------------------------------------

alter table public.note_pages add column if not exists archived_at timestamptz;

-- Carry across anything the old flag had marked before replacing it. In
-- practice this touches no rows -- the flag had no UI -- but dropping a
-- column that might hold state without reading it first is how data goes
-- missing.
update public.note_pages
   set archived_at = now()
 where is_archived and archived_at is null;

drop index if exists public.note_pages_owner_idx;

alter table public.note_pages drop column if exists is_archived;
alter table public.note_pages
  add column is_archived boolean
  generated always as (archived_at is not null) stored;

create index if not exists note_pages_owner_idx
  on public.note_pages (owner_id, is_archived);
create index if not exists note_pages_archived_idx
  on public.note_pages (owner_id, archived_at desc)
  where archived_at is not null;

-- ---------------------------------------------------------------------------
-- Promote the meetings that were already being used as series
-- ---------------------------------------------------------------------------
--
-- Any meeting with something nested inside it was a series in all but name.
-- Promote it, and rather than discarding the notes typed on the parent, file
-- them as the first occurrence -- dated from the parent's own meeting date, so
-- it sorts into the series where it actually belongs.

do $$
declare
  target_id      uuid;
  target_ids     uuid[];
  parent         public.note_pages%rowtype;
  occurrence_id  uuid;
begin
  select array_agg(p.id) into target_ids
    from public.note_pages p
   where p.kind = 'meeting'
     and exists (select 1 from public.note_pages c where c.parent_id = p.id);

  if target_ids is null then
    return;
  end if;

  foreach target_id in array target_ids loop
    select * into parent from public.note_pages where id = target_id;
    occurrence_id := null;

    if coalesce(btrim(parent.body), '') <> ''
       or coalesce(btrim(parent.transcript), '') <> '' then
      insert into public.note_pages
        (owner_id, parent_id, title, kind, body, enhanced_body, transcript,
         meeting_date, attendees, position)
      values
        (parent.owner_id,
         parent.id,
         to_char(coalesce(parent.meeting_date, parent.created_at::date),
                 'FMMon FMDD, YYYY'),
         'meeting',
         parent.body,
         parent.enhanced_body,
         parent.transcript,
         coalesce(parent.meeting_date, parent.created_at::date),
         parent.attendees,
         -1)
      returning id into occurrence_id;

      -- Action items read out of those notes belong to the sitting, not to
      -- the series. Their todo section is left where it is -- it is only a
      -- name on the board -- but the link back to a note page has to follow
      -- the notes, or "open items from your notes" would point at a series
      -- with no action items panel to land on.
      update public.todo_tasks
         set source_page_id = occurrence_id
       where source_page_id = parent.id;
    end if;

    update public.note_pages
       set kind          = 'series',
           body          = '',
           enhanced_body = null,
           transcript    = null,
           meeting_date  = null
     where id = parent.id;
  end loop;
end $$;
