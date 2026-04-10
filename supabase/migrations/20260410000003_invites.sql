-- 003_invites.sql
-- Pending invites for reviewers (or owners — a reviewer can also invite
-- someone to be their owner, i.e. "I want to review you"). The token is
-- the URL-safe identifier delivered to the invitee.

create type public.invite_type as enum ('reviewer', 'owner');
create type public.invite_status as enum ('pending', 'accepted', 'revoked', 'expired');

create table if not exists public.invites (
  id           uuid primary key default gen_random_uuid(),
  inviter_id   uuid not null references public.users(id) on delete cascade,
  invitee_email text not null,
  invite_type  public.invite_type not null,
  token        text not null unique,
  status       public.invite_status not null default 'pending',
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  accepted_by  uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists invites_inviter_idx on public.invites (inviter_id);
create index if not exists invites_email_idx on public.invites (invitee_email);
create index if not exists invites_status_idx on public.invites (status);

alter table public.invites enable row level security;
