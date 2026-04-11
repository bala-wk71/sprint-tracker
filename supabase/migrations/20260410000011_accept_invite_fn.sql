-- 011_accept_invite_fn.sql
-- SECURITY DEFINER function to accept an invite by token. Needed because:
--
--   * The invitee may need to insert a reviewer_relationships row where they
--     are the OWNER (invite_type = 'owner'), but the rr-insert RLS policy
--     requires reviewer_id = auth.uid(). A definer function bypasses RLS.
--   * We want to atomically validate the token, check the email match, mark
--     the invite accepted, and create the relationship.
--
-- The function is callable by any authenticated user. It enforces:
--   1. The invite exists, is pending, and not expired.
--   2. The caller's email matches the invitee_email on the invite.
--   3. The caller is not the inviter (no self-acceptance).
--
-- Returns the owner_id of the resulting relationship so the client can
-- redirect appropriately ("you can now review <name>" → /review/<id>).

create or replace function public.accept_invite(invite_token text)
returns table (relationship_id uuid, owner_id uuid, reviewer_id uuid)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_invite      public.invites%rowtype;
  v_caller_id   uuid := auth.uid();
  v_caller_email text;
  v_owner_id    uuid;
  v_reviewer_id uuid;
  v_rel_id      uuid;
begin
  if v_caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select email into v_caller_email
  from public.users
  where id = v_caller_id;

  if v_caller_email is null then
    raise exception 'User profile missing' using errcode = 'P0002';
  end if;

  select * into v_invite
  from public.invites
  where token = invite_token
  for update;

  if not found then
    raise exception 'Invite not found' using errcode = 'P0002';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'Invite is no longer pending (status: %)', v_invite.status
      using errcode = 'P0001';
  end if;

  if v_invite.expires_at < now() then
    update public.invites set status = 'expired' where id = v_invite.id;
    raise exception 'Invite has expired' using errcode = 'P0001';
  end if;

  if lower(v_invite.invitee_email) <> lower(v_caller_email) then
    raise exception 'This invite was sent to a different email address'
      using errcode = 'P0001';
  end if;

  if v_invite.inviter_id = v_caller_id then
    raise exception 'You cannot accept your own invite' using errcode = 'P0001';
  end if;

  -- Translate invite_type into who is the owner / who is the reviewer.
  --   reviewer  → inviter wants the invitee to review them: invitee = reviewer
  --   owner     → inviter wants to review the invitee: invitee = owner
  if v_invite.invite_type = 'reviewer' then
    v_owner_id    := v_invite.inviter_id;
    v_reviewer_id := v_caller_id;
  else
    v_owner_id    := v_caller_id;
    v_reviewer_id := v_invite.inviter_id;
  end if;

  insert into public.reviewer_relationships (owner_id, reviewer_id)
  values (v_owner_id, v_reviewer_id)
  on conflict (owner_id, reviewer_id) do update
    set owner_id = excluded.owner_id  -- no-op so RETURNING works
  returning id into v_rel_id;

  update public.invites
  set status      = 'accepted',
      accepted_at = now(),
      accepted_by = v_caller_id
  where id = v_invite.id;

  return query select v_rel_id, v_owner_id, v_reviewer_id;
end;
$$;

grant execute on function public.accept_invite(text) to authenticated;
