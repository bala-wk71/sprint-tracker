-- 002_reviewer_relationships.sql
-- Owner <-> Reviewer relationships. A user can be both an owner of their
-- own data and a reviewer for someone else's. Created when an invite is
-- accepted.

create table if not exists public.reviewer_relationships (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.users(id) on delete cascade,
  reviewer_id  uuid not null references public.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  constraint reviewer_relationships_unique unique (owner_id, reviewer_id),
  constraint reviewer_relationships_no_self check (owner_id <> reviewer_id)
);

create index if not exists reviewer_relationships_owner_idx
  on public.reviewer_relationships (owner_id);
create index if not exists reviewer_relationships_reviewer_idx
  on public.reviewer_relationships (reviewer_id);

alter table public.reviewer_relationships enable row level security;
