"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Bot, Search, Send, Sparkles, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/shared/Markdown";
import { createThread } from "./actions";

export type ChatMessage = {
  id: string;
  role: string;
  content: string;
  tool_calls: unknown;
  created_at: string;
};

const SUGGESTIONS = [
  "How is my week going so far?",
  "What should I focus on today?",
  "Where am I losing time to noise?",
  "Summarise yesterday's log",
];

export function ChatPane({
  conversationId,
  initialMessages,
  coachReadsJournal,
}: {
  conversationId: string | null;
  initialMessages: ChatMessage[];
  coachReadsJournal: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [lookups, setLookups] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, draft, scrollToBottom]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const send = async (messageText?: string) => {
    const text = (messageText ?? input).trim();
    if (!text || streaming) return;

    setInput("");
    setError(null);
    setStreaming(true);
    setDraft("");
    setLookups([]);

    // The first message in a brand-new session has no thread to land in.
    // Create one titled from the message rather than making the user press
    // "New chat" before they can say anything.
    let id = conversationId;
    if (!id) {
      const created = await createThread(text);
      if (!created.ok) {
        setError(created.error);
        setStreaming(false);
        return;
      }
      id = created.id;
    }

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        tool_calls: null,
        created_at: new Date().toISOString(),
      },
    ]);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId: id }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      const used: string[] = [];

      // Same SSE framing the server writes: one JSON object per `data:` line,
      // events separated by a blank line.
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sep = buffer.indexOf("\n\n");
        while (sep !== -1) {
          const event = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          for (const line of event.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            try {
              const msg = JSON.parse(payload) as {
                t?: string;
                tool?: string;
                reset?: boolean;
                error?: string;
                done?: boolean;
              };
              if (msg.error) throw new Error(msg.error);
              if (msg.reset) {
                // That text was preamble before a lookup; drop it so the
                // real answer doesn't read as a continuation of it.
                answer = "";
                setDraft("");
              }
              if (msg.tool) {
                used.push(msg.tool);
                setLookups([...used]);
              }
              if (msg.t) {
                answer += msg.t;
                setDraft(answer);
              }
            } catch (err) {
              if (err instanceof Error && err.message) throw err;
            }
          }
          sep = buffer.indexOf("\n\n");
        }
      }

      if (!answer.trim()) throw new Error("The coach didn't answer. Try again.");

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: answer,
          tool_calls: used.length > 0 ? used.map((summary) => ({ summary })) : null,
          created_at: new Date().toISOString(),
        },
      ]);
      setDraft("");
      setLookups([]);

      // Pull in the server's state: the thread's title and its position in the
      // rail both move once a message lands.
      if (!conversationId) router.replace(`/assistant?c=${id}`);
      else router.refresh();
    } catch (err) {
      setDraft("");
      setLookups([]);
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setStreaming(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const empty = messages.length === 0 && !draft;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-border bg-card">
      <div className="flex-1 overflow-y-auto p-4">
        {empty ? (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-md text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-background">
                <Bot className="h-7 w-7 text-primary" />
              </div>
              <p className="text-base font-semibold text-foreground">
                Your Sprint Coach
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Ask about your sprints, days, health or goals — answers are
                grounded in your actual data.
                {!coachReadsJournal && (
                  <>
                    {" "}
                    Your journal stays private until you turn that on in
                    settings.
                  </>
                )}
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    disabled={streaming}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50"
                  >
                    <Sparkles className="h-3 w-3 text-primary" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}

            {draft && (
              <MessageBubble
                message={{
                  id: "streaming",
                  role: "assistant",
                  content: draft,
                  tool_calls: lookups.map((summary) => ({ summary })),
                  created_at: new Date().toISOString(),
                }}
                pending
              />
            )}

            {streaming && !draft && lookups.length > 0 && (
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <Lookups items={lookups} live />
              </div>
            )}

            {streaming && !draft && lookups.length === 0 && (
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="flex items-center gap-1 rounded-lg bg-muted/50 px-4 py-3.5">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
                </div>
              </div>
            )}

            <div ref={endRef} />
          </div>
        )}
      </div>

      {error && (
        <div className="mx-4 mb-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="border-t border-border bg-card p-4">
        <div className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask your coach..."
            rows={1}
            disabled={streaming}
            className="max-h-40 min-h-[2.75rem] flex-1 resize-none rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
          <button
            onClick={() => send()}
            disabled={streaming || !input.trim()}
            aria-label="Send message"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}

const emptySubscribe = () => () => {};

function MessageBubble({
  message,
  pending = false,
}: {
  message: ChatMessage;
  pending?: boolean;
}) {
  const isUser = message.role === "user";
  const lookups = readLookups(message.tool_calls);
  // Timestamps are timezone-dependent, so the server-rendered text can differ
  // from the client's and trip hydration. Render them client-only.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  return (
    <div className={cn("flex items-start gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-muted" : "bg-primary/10"
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Bot className="h-4 w-4 text-primary" />
        )}
      </div>
      <div className={cn("min-w-0 max-w-[80%]", isUser && "text-right")}>
        <div
          className={cn(
            "rounded-lg px-4 py-3 text-left text-sm",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted/50 text-foreground"
          )}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap break-words">
              {message.content}
            </div>
          ) : (
            <Markdown content={message.content} />
          )}
          {!isUser && lookups.length > 0 && (
            <div className="mt-2.5 border-t border-border/50 pt-2">
              <Lookups items={lookups} />
            </div>
          )}
        </div>
        {!pending && (
          <p className="mt-1 min-h-[15px] px-1 text-[10px] text-muted-foreground/70">
            {mounted ? format(new Date(message.created_at), "MMM d, HH:mm") : null}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * tool_calls is jsonb, so anything could be in there — rows written before
 * tool calling existed hold null, and a hand-edited row could hold anything.
 * Read defensively and show nothing rather than throwing inside a message.
 */
function readLookups(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) =>
      entry && typeof entry === "object" && "summary" in entry
        ? String((entry as { summary: unknown }).summary)
        : null
    )
    .filter((s): s is string => Boolean(s));
}

/**
 * What the coach went and read to answer. Grounding you can check beats a
 * confident paragraph you have to take on trust — and when it says "no logs
 * for that week", this is what shows it actually looked.
 */
function Lookups({ items, live = false }: { items: string[]; live?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5",
        live && "rounded-lg bg-muted/50 px-4 py-3"
      )}
    >
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Search className={cn("h-3 w-3", live && "animate-pulse")} />
        {live ? "Reading" : "Read"}
      </span>
      {items.map((item, i) => (
        <span
          key={`${item}-${i}`}
          className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground"
        >
          {item}
        </span>
      ))}
    </div>
  );
}
