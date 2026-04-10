-- 006_comments.sql
-- Threaded comments left by reviewers (or owners) on either a daily_log
-- or a sprint. Polymorphic via target_type + target_id.

create type public.comment_target_type as enum ('daily_log', 'sprint');

create table if not exists public.comments (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references public.users(id) on delete cascade,
  -- The user whose data is being commented on. Stored explicitly so RLS
  -- can check ownership without joining to the target table.
  owner_id      uuid not null references public.users(id) on delete cascade,
  target_type   public.comment_target_type not null,
  target_id     uuid not null,
  parent_id     uuid references public.comments(id) on delete cascade,
  body          text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists comments_target_idx on public.comments (target_type, target_id);
create index if not exists comments_owner_idx on public.comments (owner_id);
create index if not exists comments_author_idx on public.comments (author_id);
create index if not exists comments_parent_idx on public.comments (parent_id);

drop trigger if exists comments_set_updated_at on public.comments;
create trigger comments_set_updated_at
before update on public.comments
for each row execute function public.set_updated_at();

alter table public.comments enable row level security;
