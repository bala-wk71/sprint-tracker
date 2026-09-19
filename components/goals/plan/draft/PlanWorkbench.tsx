"use client";

import { useEffect, useState } from "react";
import { FileText, MessageSquare, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanDraft } from "@/lib/planning/draft";
import type { Specialist } from "@/lib/planning/constants";
import { ImportPanel } from "./ImportPanel";
import { PlannerChat, type ChatMessage } from "./PlannerChat";
import { DraftReview } from "./DraftReview";

type Mode = "coach" | "import";
type Saved = { mode: Mode; specialist: Specialist; messages: ChatMessage[]; draft: PlanDraft | null; warnings: string[] };

// An unsaved plan survives a refresh on this device. Per-viewer convenience
// only: the draft is never read back by the server from here.
const STORAGE_KEY = "plan-workbench-v1";

function load(scope: string): Saved | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${scope}`);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function store(scope: string, value: Saved | null) {
  try {
    if (value) localStorage.setItem(`${STORAGE_KEY}:${scope}`, JSON.stringify(value));
    else localStorage.removeItem(`${STORAGE_KEY}:${scope}`);
  } catch {
    // Private mode or storage full: the plan just won't survive a refresh.
  }
}

/** Plan with the coach, or import a roadmap; either way, review then save. */
export function PlanWorkbench({
  initialMode,
  initialSpecialist,
  todayIso,
  existingStreams,
  goal,
}: {
  initialMode: Mode;
  initialSpecialist: Specialist;
  todayIso: string;
  existingStreams: string[];
  goal: { id: string; title: string } | null;
}) {
  const scope = goal?.id ?? "new";
  const [mode, setMode] = useState<Mode>(goal ? "coach" : initialMode);
  const [specialist, setSpecialist] = useState<Specialist>(initialSpecialist);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [restored, setRestored] = useState(false);

  // Restore after mount: localStorage isn't available during the server render.
  useEffect(() => {
    const saved = load(scope);
    if (saved) {
      /* eslint-disable react-hooks/set-state-in-effect -- one-time restore from storage */
      setMode(goal ? "coach" : saved.mode);
      setSpecialist(saved.specialist);
      setMessages(saved.messages);
      setDraft(saved.draft);
      setWarnings(saved.warnings);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
    setRestored(true);
  }, [scope, goal]);

  useEffect(() => {
    if (!restored) return;
    store(scope, messages.length || draft ? { mode, specialist, messages, draft, warnings } : null);
  }, [restored, scope, mode, specialist, messages, draft, warnings]);

  const startOver = () => {
    if ((messages.length || draft) && !window.confirm("Start over? This clears the conversation and the unsaved plan.")) return;
    setMessages([]);
    setDraft(null);
    setWarnings([]);
  };

  const receive = (next: PlanDraft, w: string[]) => {
    setDraft(next);
    setWarnings(w);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {goal ? (
          <span />
        ) : (
          <div role="tablist" aria-label="How to plan" className="inline-flex gap-1 rounded-lg border border-border bg-card p-1">
            {[
              { value: "coach" as const, label: "Plan with the coach", icon: MessageSquare },
              { value: "import" as const, label: "Import a roadmap", icon: FileText },
            ].map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={mode === t.value}
                onClick={() => setMode(t.value)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  mode === t.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </div>
        )}
        {(messages.length > 0 || draft) && (
          <button type="button" onClick={startOver} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <RotateCcw className="h-3.5 w-3.5" />
            Start over
          </button>
        )}
      </div>

      <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
        {mode === "coach" ? (
          <PlannerChat
            specialist={specialist}
            onSpecialist={setSpecialist}
            messages={messages}
            onMessages={setMessages}
            draft={draft}
            goal={goal}
            onDraft={receive}
          />
        ) : (
          <ImportPanel onDraft={receive} />
        )}
      </section>

      {draft && (
        <DraftReview
          draft={draft}
          warnings={warnings}
          todayIso={todayIso}
          existingStreams={existingStreams}
          onChange={setDraft}
          onSaved={() => {
            store(scope, null);
            setMessages([]);
            setDraft(null);
            setWarnings([]);
          }}
        />
      )}
    </div>
  );
}
