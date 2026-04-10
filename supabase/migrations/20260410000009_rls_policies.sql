-- 009_rls_policies.sql
-- Row Level Security for every table.
--
-- Two roles, in app terms:
--   * Owner    — full read/write on their own data.
--   * Reviewer — read-only on owners who have invited them; private rows
--                and private fields are hidden by per-table policies.
--
-- Privacy model:
--   * daily_logs.reflection / gratitude — text columns flagged private.
--     RLS can't hide *columns*, so the policy hides the entire row only
--     if the privacy flags are set AND the viewer is a reviewer. The app
--     UI is responsible for blanking the actual fields when a row is
--     read by a reviewer (we keep the row visible so non-private fields
--     still render). To make that work we use a *view-or-app* split:
--     reviewers can SELECT the row, the app nulls out private fields.
--   * time_entries.is_private — entire row hidden from reviewers.
--   * comments.body has no privacy concept.

-----------------------------------------------------------------------
-- helpers
-----------------------------------------------------------------------

-- Is auth.uid() a reviewer of the given owner?
create or replace function public.is_reviewer_of(target_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.reviewer_relationships rr
    where rr.owner_id    = target_owner
      and rr.reviewer_id = auth.uid()
  );
$$;

-- Either the owner themselves, or a reviewer of the owner.
create or replace function public.can_view_owner(target_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_owner = auth.uid()
      or public.is_reviewer_of(target_owner);
$$;

-----------------------------------------------------------------------
-- users
-----------------------------------------------------------------------

drop policy if exists "users self select" on public.users;
create policy "users self select"
  on public.users for select
  using (
    id = auth.uid()
    or public.is_reviewer_of(id)
    -- a user can also see the basic profile of anyone who reviews them,
    -- so the "Access" page can render reviewer names.
    or exists (
      select 1 from public.reviewer_relationships rr
      where rr.reviewer_id = id and rr.owner_id = auth.uid()
    )
  );

drop policy if exists "users self update" on public.users;
create policy "users self update"
  on public.users for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Inserts happen via the auth trigger (security definer), no client policy.

-----------------------------------------------------------------------
-- reviewer_relationships
-----------------------------------------------------------------------

drop policy if exists "rr visible to participants" on public.reviewer_relationships;
create policy "rr visible to participants"
  on public.reviewer_relationships for select
  using (owner_id = auth.uid() or reviewer_id = auth.uid());

-- Only the owner can delete a relationship (revoke access).
drop policy if exists "rr owner delete" on public.reviewer_relationships;
create policy "rr owner delete"
  on public.reviewer_relationships for delete
  using (owner_id = auth.uid());

-- Inserts are done by the invite-acceptance API route running as the
-- authenticated invitee; the inserted reviewer_id must be the caller.
drop policy if exists "rr invitee insert" on public.reviewer_relationships;
create policy "rr invitee insert"
  on public.reviewer_relationships for insert
  with check (reviewer_id = auth.uid());

-----------------------------------------------------------------------
-- invites
-----------------------------------------------------------------------

drop policy if exists "invites inviter all" on public.invites;
create policy "invites inviter all"
  on public.invites for all
  using (inviter_id = auth.uid())
  with check (inviter_id = auth.uid());

-- Invitee can see an invite addressed to their email (so the accept page
-- can validate before showing the form). Looked up by token in practice;
-- this policy makes it work via the standard PostgREST client.
drop policy if exists "invites invitee select" on public.invites;
create policy "invites invitee select"
  on public.invites for select
  using (
    invitee_email = (select email from public.users where id = auth.uid())
  );

-----------------------------------------------------------------------
-- sprints
-----------------------------------------------------------------------

drop policy if exists "sprints owner all" on public.sprints;
create policy "sprints owner all"
  on public.sprints for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "sprints reviewer select" on public.sprints;
create policy "sprints reviewer select"
  on public.sprints for select
  using (public.is_reviewer_of(owner_id));

-----------------------------------------------------------------------
-- tasks
-----------------------------------------------------------------------

drop policy if exists "tasks owner all" on public.tasks;
create policy "tasks owner all"
  on public.tasks for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "tasks reviewer select" on public.tasks;
create policy "tasks reviewer select"
  on public.tasks for select
  using (public.is_reviewer_of(owner_id));

-----------------------------------------------------------------------
-- daily_logs
-----------------------------------------------------------------------

drop policy if exists "daily_logs owner all" on public.daily_logs;
create policy "daily_logs owner all"
  on public.daily_logs for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "daily_logs reviewer select" on public.daily_logs;
create policy "daily_logs reviewer select"
  on public.daily_logs for select
  using (public.is_reviewer_of(owner_id));

-----------------------------------------------------------------------
-- priorities
-----------------------------------------------------------------------

drop policy if exists "priorities owner all" on public.priorities;
create policy "priorities owner all"
  on public.priorities for all
  using (
    exists (
      select 1 from public.daily_logs dl
      where dl.id = priorities.daily_log_id
        and dl.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.daily_logs dl
      where dl.id = priorities.daily_log_id
        and dl.owner_id = auth.uid()
    )
  );

drop policy if exists "priorities reviewer select" on public.priorities;
create policy "priorities reviewer select"
  on public.priorities for select
  using (
    exists (
      select 1 from public.daily_logs dl
      where dl.id = priorities.daily_log_id
        and public.is_reviewer_of(dl.owner_id)
    )
  );

-----------------------------------------------------------------------
-- time_entries
-----------------------------------------------------------------------

drop policy if exists "time_entries owner all" on public.time_entries;
create policy "time_entries owner all"
  on public.time_entries for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Reviewers see only non-private time entries.
drop policy if exists "time_entries reviewer select" on public.time_entries;
create policy "time_entries reviewer select"
  on public.time_entries for select
  using (
    public.is_reviewer_of(owner_id)
    and is_private = false
  );

-----------------------------------------------------------------------
-- comments
-----------------------------------------------------------------------

-- Owner of the target can see all comments on their data.
drop policy if exists "comments owner select" on public.comments;
create policy "comments owner select"
  on public.comments for select
  using (owner_id = auth.uid());

-- Author can always see/edit/delete their own comments.
drop policy if exists "comments author all" on public.comments;
create policy "comments author all"
  on public.comments for all
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- A reviewer can read comments on owners they review (so threads render).
drop policy if exists "comments reviewer select" on public.comments;
create policy "comments reviewer select"
  on public.comments for select
  using (public.is_reviewer_of(owner_id));

-- A reviewer (or the owner) can post comments on the owner's data.
drop policy if exists "comments authorized insert" on public.comments;
create policy "comments authorized insert"
  on public.comments for insert
  with check (
    author_id = auth.uid()
    and public.can_view_owner(owner_id)
  );

-----------------------------------------------------------------------
-- recurring_templates
-----------------------------------------------------------------------

drop policy if exists "recurring_templates owner all" on public.recurring_templates;
create policy "recurring_templates owner all"
  on public.recurring_templates for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-----------------------------------------------------------------------
-- notification_preferences
-----------------------------------------------------------------------

drop policy if exists "notification_preferences self all" on public.notification_preferences;
create policy "notification_preferences self all"
  on public.notification_preferences for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
