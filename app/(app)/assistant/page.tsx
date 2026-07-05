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
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Sprint Coach</h1>
        <p className="mb-3 text-sm text-muted-foreground">
          Choose your coaching style — applies to chat and automated comments.
        </p>
        <PersonaSelector current={persona} />
      </div>

      <ChatInterface initialMessages={initialMessages} />
    </div>
  );
}
