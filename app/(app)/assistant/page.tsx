import { createClient } from "@/lib/supabase/server";
import { ChatInterface } from "./ChatInterface";

export default async function AssistantPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Load existing conversation messages (skip summaries)
  const { data: conversation } = await supabase
    .from("ai_conversations")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

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
        <p className="text-sm text-muted-foreground">
          Ask about your data, get productivity advice, or reflect on your
          patterns.
        </p>
      </div>

      <ChatInterface initialMessages={initialMessages} />
    </div>
  );
}
