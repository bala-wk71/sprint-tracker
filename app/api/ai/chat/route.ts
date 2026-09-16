import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  generateResponse,
  streamResponse,
  type GeminiMessage,
} from "@/lib/ai/gemini";
import { gatherChatContext } from "@/lib/ai/context";
import { getChatPrompt, type AiPersona } from "@/lib/ai/prompts";
import { toWeekStartDay } from "@/lib/week";

const COMPACT_THRESHOLD_MESSAGES = 50;
const COMPACT_THRESHOLD_CHARS = 100_000;
const KEEP_RECENT = 10;

/** One SSE event, framed the way ChatPane parses it. */
function sse(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

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
  const conversationId =
    typeof body.conversationId === "string" ? body.conversationId : "";

  if (!userMessage) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }
  if (!conversationId) {
    return NextResponse.json(
      { error: "Conversation required" },
      { status: 400 }
    );
  }

  // Ownership is enforced by RLS, but checking here turns a silent empty
  // thread into an honest 404 rather than a coach answering into the void.
  const { data: conversation } = await supabase
    .from("ai_conversations")
    .select("id, title")
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  await supabase.from("ai_messages").insert({
    conversation_id: conversation.id,
    role: "user",
    content: userMessage,
  });

  // Load messages: the latest summary, then everything after it.
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

      const kept = nonSummaryMessages.slice(toCompact.length);

      // Backdate the summary to the first kept message. The loader above reads
      // `created_at >= latest summary`, so a summary stamped "now" would hide
      // the kept messages from every later request. A tie with that message is
      // harmless: the summary is picked out by is_summary, not position.
      const { data: summaryRow } = await supabase
        .from("ai_messages")
        .insert({
          conversation_id: conversation.id,
          role: "system",
          content: summary,
          is_summary: true,
          created_at: kept[0].created_at,
        })
        .select("id, role, content, is_summary, created_at")
        .single();

      messages.splice(
        0,
        messages.length,
        summaryRow ?? {
          id: "summary",
          role: "system",
          content: summary,
          is_summary: true,
          created_at: kept[0].created_at,
        },
        ...kept
      );
    }
  }

  const { data: profile } = await supabase
    .from("users")
    .select("ai_persona, week_start_day")
    .eq("id", user.id)
    .single();
  const persona: AiPersona = profile?.ai_persona ?? "rational";

  const dataContext = await gatherChatContext(
    supabase,
    user.id,
    toWeekStartDay(profile?.week_start_day)
  );

  const systemInstruction = `${getChatPrompt(persona)}\n\n## User's Current Data\n${dataContext}`;

  const geminiMessages: GeminiMessage[] = [];

  const summaryMsg = messages.find((m) => m.is_summary);
  if (summaryMsg) {
    geminiMessages.push({
      role: "user",
      parts: [{ text: `[Previous conversation summary: ${summaryMsg.content}]` }],
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

  for (const m of messages.filter((m) => !m.is_summary)) {
    geminiMessages.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = "";
      try {
        for await (const chunk of streamResponse(
          systemInstruction,
          geminiMessages
        )) {
          answer += chunk;
          controller.enqueue(encoder.encode(sse({ t: chunk })));
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "The coach is unavailable.";
        // A mid-stream failure still leaves the client whatever arrived, so
        // report the error rather than silently closing on a partial answer.
        controller.enqueue(encoder.encode(sse({ error: message })));
      }

      // Persist whatever was produced. A partial answer is still worth keeping
      // — it is what the user read, and losing it on reload would be worse.
      if (answer.trim()) {
        await supabase.from("ai_messages").insert({
          conversation_id: conversation.id,
          role: "assistant",
          content: answer,
        });
        await supabase
          .from("ai_conversations")
          .update({
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversation.id);
      }

      controller.enqueue(encoder.encode(sse({ done: true })));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
