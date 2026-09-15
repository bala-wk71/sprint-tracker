-- 20260915000005_goal_links.sql
-- Connect the week to the long view: a sprint task or a todo can say which
-- goal it serves, so a goal can show the hours and work that went into it.
-- Deleting a goal keeps the work; it just stops pointing anywhere.

alter table public.tasks
  add column if not exists goal_id uuid references public.goals(id) on delete set null;

alter table public.todo_tasks
  add column if not exists goal_id uuid references public.goals(id) on delete set null;

create index if not exists tasks_goal_idx
  on public.tasks (goal_id) where goal_id is not null;
create index if not exists todo_tasks_goal_idx
  on public.todo_tasks (goal_id) where goal_id is not null;

-- ---------------------------------------------------------------------------
-- Comments must point at something the commenter is allowed to see.
--
-- Until now the insert policy only checked the owner relationship, so a
-- reviewer could attach a comment to any id, including a row they can't read.
-- With private goals and journal entries that matters: a comment thread on a
-- private entry must be neither writable nor readable by a reviewer.

create or replace function public.comment_target_visible(
  t public.comment_target_type,
  target uuid,
  target_owner uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case t
    when 'daily_log' then exists (
      select 1 from public.daily_logs
       where id = target and owner_id = target_owner)
    when 'sprint' then exists (
      select 1 from public.sprints
       where id = target and owner_id = target_owner)
    when 'goal' then exists (
      select 1 from public.goals
       where id = target and owner_id = target_owner
         and (owner_id = auth.uid() or is_private = false))
    when 'journal_entry' then exists (
      select 1 from public.journal_entries
       where id = target and owner_id = target_owner
         and (owner_id = auth.uid() or is_private = false))
    else false
  end;
$$;

drop policy if exists "comments authorized insert" on public.comments;
create policy "comments authorized insert"
  on public.comments for insert
  with check (
    author_id = auth.uid()
    and public.can_view_owner(owner_id)
    and public.comment_target_visible(target_type, target_id, owner_id)
  );

drop policy if exists "comments reviewer select" on public.comments;
create policy "comments reviewer select"
  on public.comments for select
  using (
    public.is_reviewer_of(owner_id)
    and public.comment_target_visible(target_type, target_id, owner_id)
  );
