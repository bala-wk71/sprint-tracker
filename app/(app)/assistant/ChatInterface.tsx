"use client";

import {
  useRef,
  useState,
  useEffect,
  useCallback,
  useSyncExternalStore,
} from "react";
import { format } from "date-fns";
import { Bot, Send, User, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Markdown } from "./Markdown";

type Message = {
  id: string;
  role: string;
  content: string;
  created_at: string;
};

const SUGGESTIONS = [
  "How is my week going so far?",
  "What should I focus on today?",
  "Where am I losing time to noise?",
  "Summarise yesterday's log",
];

export function ChatInterface({
  initialMessages,
}: {
  initialMessages: Message[];
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  const sendMessage = async (messageText?: string) => {
    const text = (messageText ?? input).trim();
    if (!text || sending) return;

    setInput("");
    setError(null);
    setSending(true);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const data = await res.json();
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.message,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-md text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-background">
                <Bot className="h-7 w-7 text-primary" />
              </div>
              <p className="text-base font-semibold text-foreground">
                Your Sprint Coach
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Ask about your sprints, daily logs, or productivity patterns —
                answers are grounded in your actual data.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => sendMessage(suggestion)}
                    disabled={sending}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50"
                  >
                    <Sparkles className="h-3 w-3 text-primary" />
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {sending && (
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

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-border bg-card p-4">
        <div className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask your coach..."
            rows={1}
            disabled={sending}
            className="max-h-40 min-h-[2.75rem] flex-1 resize-none rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
          <button
            onClick={() => sendMessage()}
            disabled={sending || !input.trim()}
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

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  // Timestamps are timezone-dependent, so the server-rendered text can
  // differ from the client's and trip hydration. Render them client-only.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  return (
    <div
      className={cn("flex items-start gap-3", isUser && "flex-row-reverse")}
    >
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
      <div className={cn("max-w-[80%]", isUser && "text-right")}>
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
        </div>
        <p className="mt-1 min-h-[15px] px-1 text-[10px] text-muted-foreground/70">
          {mounted ? format(new Date(message.created_at), "MMM d, HH:mm") : null}
        </p>
      </div>
    </div>
  );
}
