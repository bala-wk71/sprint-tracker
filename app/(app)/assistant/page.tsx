import { createClient, getUser } from "@/lib/supabase/server";
import { ChatInterface } from "./ChatInterface";
import { PersonaSelector } from "./PersonaSelector";
import type { AiPersona } from "@/lib/ai/prompts";

export default async function AssistantPage() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  // Persona and conversation lookups are independent.
  const [{ data: profile }, { data: conversation }] = await Promise.all([
    supabase.from("users").select("ai_persona").eq("id", user.id).single(),
    supabase
      .from("ai_conversations")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const persona: AiPersona = profile?.ai_persona ?? "rational";

  let initialMessages: { id: string; role: string; content: string; created_at: string }[] = [];

  if (conversation) {
    const { data: messages } = await supabase
      .from("ai_messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", conversation.id)
      .eq("is_summary", false)
      .order("created_at", { ascending: true });

    initialMessages = messages ?? [];
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col sm:h-[calc(100vh-7rem)]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sprint Coach</h1>
          <p className="text-sm text-muted-foreground">
            Knows your sprints, logs, and priorities.
          </p>
        </div>
        <div className="flex flex-col items-start gap-1.5 sm:items-end">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Coaching style — applies to chat and comments
          </p>
          <PersonaSelector current={persona} />
        </div>
      </div>

      <ChatInterface initialMessages={initialMessages} />
    </div>
  );
}
