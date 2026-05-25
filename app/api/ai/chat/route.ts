import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateResponse, type GeminiMessage } from "@/lib/ai/gemini";
import { gatherChatContext } from "@/lib/ai/context";
import { getChatPrompt, type AiPersona } from "@/lib/ai/prompts";

const COMPACT_THRESHOLD_MESSAGES = 50;
const COMPACT_THRESHOLD_CHARS = 100_000;
const KEEP_RECENT = 10;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const userMessage = typeof body.message === "string" ? body.message.trim() : "";
  if (!userMessage) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  // Get or create conversation
  let { data: conversation } = await supabase
    .from("ai_conversations")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!conversation) {
    const { data: created, error } = await supabase
      .from("ai_conversations")
      .insert({ user_id: user.id })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    conversation = created;
  }

  // Save user message
  await supabase.from("ai_messages").insert({
    conversation_id: conversation.id,
    role: "user",
    content: userMessage,
  });

  // Load messages: find latest summary, then all messages after it
  const { data: latestSummary } = await supabase
    .from("ai_messages")
    .select("id, created_at")
    .eq("conversation_id", conversation.id)
    .eq("is_summary", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let messagesQuery = supabase
    .from("ai_messages")
    .select("id, role, content, is_summary, created_at")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true });

  if (latestSummary) {
    messagesQuery = messagesQuery.gte("created_at", latestSummary.created_at);
  }

  const { data: allMessages } = await messagesQuery;
  const messages = allMessages ?? [];

  // Check if compaction is needed
  const nonSummaryMessages = messages.filter((m) => !m.is_summary);
  const totalChars = nonSummaryMessages.reduce(
    (s, m) => s + m.content.length,
    0
  );

  if (
    nonSummaryMessages.length > COMPACT_THRESHOLD_MESSAGES ||
    totalChars > COMPACT_THRESHOLD_CHARS
  ) {
    const toCompact = nonSummaryMessages.slice(
      0,
      Math.max(0, nonSummaryMessages.length - KEEP_RECENT)
    );

    if (toCompact.length > 0) {
      const compactPrompt = toCompact
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");

      const summary = await generateResponse(
        "Summarize this conversation concisely. Preserve key facts the user shared, decisions made, advice given, ongoing topics, and preferences. Keep under 500 words.",
        [{ role: "user", parts: [{ text: compactPrompt }] }]
      );

      await supabase.from("ai_messages").insert({
        conversation_id: conversation.id,
        role: "system",
        content: summary,
        is_summary: true,
      });

      // Re-fetch messages after compaction
      const { data: refreshed } = await supabase
        .from("ai_messages")
        .select("id, role, content, is_summary, created_at")
        .eq("conversation_id", conversation.id)
        .gte("created_at", new Date().toISOString())
        .order("created_at", { ascending: true });

      // Fall through with current messages minus compacted ones
      messages.splice(0, messages.length, ...(refreshed ?? messages));
    }
  }

  // Get user's persona preference
  const { data: profile } = await supabase
    .from("users")
    .select("ai_persona")
    .eq("id", user.id)
    .single();
  const persona: AiPersona = profile?.ai_persona ?? "rational";

  // Gather data context
  const dataContext = await gatherChatContext(supabase, user.id);

  // Build Gemini messages
  const systemInstruction = `${getChatPrompt(persona)}\n\n## User's Current Data\n${dataContext}`;

  const geminiMessages: GeminiMessage[] = [];

  // Add summary as first context if exists
  const summaryMsg = messages.find((m) => m.is_summary);
  if (summaryMsg) {
    geminiMessages.push({
      role: "user",
      parts: [
        {
          text: `[Previous conversation summary: ${summaryMsg.content}]`,
        },
      ],
    });
    geminiMessages.push({
      role: "model",
      parts: [
        {
          text: "I have the context from our previous conversation. How can I help?",
        },
      ],
    });
  }

  // Add conversation messages
  for (const m of messages.filter((m) => !m.is_summary)) {
    geminiMessages.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    });
  }

  const response = await generateResponse(systemInstruction, geminiMessages);

  // Save assistant response
  await supabase.from("ai_messages").insert({
    conversation_id: conversation.id,
    role: "assistant",
    content: response,
  });

  return NextResponse.json({ message: response });
}
