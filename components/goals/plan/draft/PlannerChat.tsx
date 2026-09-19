"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { INPUT } from "@/components/goals/GoalFormParts";
import { SPECIALISTS, type Specialist } from "@/lib/planning/constants";
import { planTurn } from "@/app/(app)/goals/plan/actions";
import type { PlanDraft } from "@/lib/planning/draft";

export type ChatMessage = { role: "user" | "model"; text: string };

const STARTERS: Record<Specialist, string[]> = {
  health: ["Lose weight without losing muscle", "Run 10K by next year", "Look fitter by my wedding"],
  business: ["Set this year's profit target for the family business", "Plan the startup's next 12 months", "Build a 6-month emergency fund"],
  skills: ["Get good at embedded systems", "Switch to a better-paying job", "Learn a new skill in 3 months"],
};

/**
 * A planning conversation with one specialist. The coach asks what it needs,
 * offers steady/target/stretch options, then writes a plan draft that appears
 * for review below. Nothing is saved from here.
 */
export function PlannerChat({
  specialist,
  onSpecialist,
  messages,
  onMessages,
  draft,
  goal,
  onDraft,
}: {
  specialist: Specialist;
  onSpecialist: (s: Specialist) => void;
  messages: ChatMessage[];
  onMessages: (m: ChatMessage[]) => void;
  draft: PlanDraft | null;
  goal: { id: string; title: string } | null;
  onDraft: (draft: PlanDraft, warnings: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, pending]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    const next = [...messages, { role: "user" as const, text: trimmed }];
    onMessages(next);
    setInput("");
    setError(null);
    startTransition(async () => {
      const result = await planTurn({ specialist, messages: next, draft, goalId: goal?.id ?? null });
      if (!result.ok) {
        // Put the message back so it can be resent; history must alternate turns.
        onMessages(messages);
        setInput(trimmed);
        setError(result.error);
        return;
      }
      onMessages([...next, { role: "model", text: result.data.reply }]);
      if (result.data.draft) onDraft(result.data.draft, result.data.warnings);
    });
  };

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Who to plan with" className="grid gap-2 sm:grid-cols-3">
        {SPECIALISTS.map((s) => (
          <button
            key={s.value}
            type="button"
            role="radio"
            aria-checked={specialist === s.value}
            disabled={messages.length > 0}
            onClick={() => onSpecialist(s.value)}
            className={cn(
              "rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed",
              specialist === s.value ? "border-primary bg-primary/10" : "border-border hover:bg-accent",
              messages.length > 0 && specialist !== s.value && "opacity-50"
            )}
          >
            <span className="block text-sm font-medium text-foreground">{s.label}</span>
            <span className="block text-xs text-muted-foreground">{s.blurb}</span>
          </button>
        ))}
      </div>

      <div className="max-h-[28rem] min-h-40 space-y-3 overflow-y-auto rounded-lg border border-border bg-background p-3">
        {messages.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {goal
                ? `Planning “${goal.title}”. Say what you want from it, and the coach will ask what it needs.`
                : "Say what you want to reach, in your own words. The coach asks what it needs, checks it's realistic, and offers a few options."}
            </p>
            {!goal && (
              <div className="flex flex-wrap gap-1.5">
                {STARTERS[specialist].map((s) => (
                  <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <p
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                )}
              >
                {m.text}
              </p>
            </div>
          ))
        )}
        {pending && <p className="text-xs text-muted-foreground">Thinking it through…</p>}
        <div ref={endRef} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2"
      >
        <label htmlFor="planner_input" className="sr-only">Message</label>
        <input
          id="planner_input"
          value={input}
          maxLength={4000}
          onChange={(e) => setInput(e.target.value)}
          placeholder={draft ? "Ask for a change: “make it 3 hours a week”" : "Type your answer"}
          className={INPUT}
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          aria-label="Send"
          className="inline-flex shrink-0 items-center rounded-md bg-primary px-3 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
