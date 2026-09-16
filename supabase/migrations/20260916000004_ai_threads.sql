-- 20260916000004_ai_threads.sql
-- Many conversations per user instead of one endless thread.
--
-- The single-thread design came from the original assistant plan, and it means
-- a question about this week's energy dip lands in the same scroll as a goal
-- review from six weeks ago. Compaction then summarises across both, so the
-- coach slowly loses the thread of each. Separate conversations keep each
-- subject's context intact and make compaction per-subject.

alter table public.ai_conversations
  drop constraint if exists ai_conversations_user_id_key;

alter table public.ai_conversations
  add column if not exists title text not null default 'New chat';

alter table public.ai_conversations
  add column if not exists last_message_at timestamptz not null default now();

alter table public.ai_conversations
  add column if not exists archived_at timestamptz;

-- The rail reads "my threads, most recent first" on every assistant render.
create index if not exists ai_conversations_user_recent_idx
  on public.ai_conversations (user_id, last_message_at desc);

-- Which data the coach actually read to answer, so the UI can show its
-- working. Null for every message written before tool calling existed.
alter table public.ai_messages
  add column if not exists tool_calls jsonb;

-- ---------------------------------------------------------------------------
-- Backfill. Existing users each have one conversation with no title and no
-- last_message_at worth sorting by.

update public.ai_conversations c
   set title = coalesce(
     nullif(
       (select left(regexp_replace(m.content, '\s+', ' ', 'g'), 60)
          from public.ai_messages m
         where m.conversation_id = c.id
           and m.role = 'user'
           and not m.is_summary
         order by m.created_at asc
         limit 1),
       ''
     ),
     'New chat'
   )
 where c.title = 'New chat';

update public.ai_conversations c
   set last_message_at = coalesce(
     (select max(m.created_at) from public.ai_messages m
       where m.conversation_id = c.id),
     c.created_at
   );

-- RLS already scopes both tables by user_id / conversation ownership, and
-- neither policy assumed a single row, so they carry over unchanged.
