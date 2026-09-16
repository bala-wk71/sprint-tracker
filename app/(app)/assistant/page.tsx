import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { ChatPane } from "./ChatPane";
import { ThreadRail } from "./ThreadRail";
import type { AiPersona } from "@/lib/ai/prompts";

type SearchParams = Promise<{ c?: string }>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const [{ data: profile }, { data: threadRows }] = await Promise.all([
    supabase
      .from("users")
      .select("ai_persona, coach_reads_journal")
      .eq("id", user.id)
      .single(),
    supabase
      .from("ai_conversations")
      .select("id, title, last_message_at")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("last_message_at", { ascending: false })
      .limit(100),
  ]);

  const persona: AiPersona = profile?.ai_persona ?? "rational";
  const threads = threadRows ?? [];

  // ?c= wins when it names a thread the user owns; otherwise fall back to the
  // most recent. A stale or forged id must not 404 the page or, worse, load
  // someone else's conversation — the list is already RLS-scoped, so checking
  // membership of it is both the ownership check and the existence check.
  const requested = params.c && UUID.test(params.c) ? params.c : null;
  const active =
    threads.find((t) => t.id === requested) ?? threads[0] ?? null;

  // Landing on a stale ?c= should correct the URL rather than silently show a
  // different thread than the one addressed.
  if (requested && active && active.id !== requested) {
    redirect(`/assistant?c=${active.id}`);
  }

  let messages: {
    id: string;
    role: string;
    content: string;
    tool_calls: unknown;
    created_at: string;
  }[] = [];

  if (active) {
    const { data } = await supabase
      .from("ai_messages")
      .select("id, role, content, tool_calls, created_at")
      .eq("conversation_id", active.id)
      .eq("is_summary", false)
      .order("created_at", { ascending: true });
    messages = data ?? [];
  }

  return (
    <div className="flex h-[calc(100dvh-8rem)] gap-4 sm:h-[calc(100dvh-7rem)]">
      <ThreadRail
        threads={threads}
        activeId={active?.id ?? null}
        persona={persona}
      />
      <ChatPane
        key={active?.id ?? "empty"}
        conversationId={active?.id ?? null}
        initialMessages={messages}
        coachReadsJournal={profile?.coach_reads_journal ?? false}
      />
    </div>
  );
}
