-- 013_ai_assistant.sql
-- AI assistant tables: conversations and messages for the chat interface,
-- plus a sentinel AI user for automated comments.

-- Sentinel AI user for authoring automated comments
insert into public.users (id, email, full_name)
values ('00000000-0000-0000-0000-000000000001', 'ai@sprint-tracker.internal', 'Sprint Coach')
on conflict (id) do nothing;

-- One conversation per user (single persistent thread)
create table if not exists public.ai_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Chat messages within a conversation
create table if not exists public.ai_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant', 'system')),
  content         text not null,
  is_summary      boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists ai_messages_conversation_idx
  on public.ai_messages (conversation_id, created_at);

-- RLS
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

create policy "Users can manage own conversation"
  on public.ai_conversations for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can manage own messages"
  on public.ai_messages for all
  using (
    conversation_id in (
      select id from public.ai_conversations where user_id = auth.uid()
    )
  )
  with check (
    conversation_id in (
      select id from public.ai_conversations where user_id = auth.uid()
    )
  );
