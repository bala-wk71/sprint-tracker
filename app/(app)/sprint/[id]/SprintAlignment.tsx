"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { alignmentLabel, type Alignment, type AlignmentGoals } from "@/lib/planning/alignment";
import { GoalAlignmentField } from "@/components/sprint/GoalAlignmentField";
import { setSprintAlignment } from "./actions";

const TONE: Record<Alignment, string> = {
  aligned: "bg-progress-good/15 text-[hsl(var(--progress-good))]",
  partly: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  off: "bg-muted text-muted-foreground",
};

/**
 * The week's one line on the goals. A sprint without one (copied from an
 * earlier week, or made before goals existed) asks for it here.
 */
export function SprintAlignment({
  sprintId,
  goals,
  alignment,
  note,
}: {
  sprintId: string;
  goals: AlignmentGoals;
  alignment: Alignment | null;
  note: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(!alignment);
  const [value, setValue] = useState<Alignment | null>(alignment);
  const [line, setLine] = useState(note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    if (!value) return setError("Pick one: aligned, partly or not this week.");
    startTransition(async () => {
      setError(null);
      const result = await setSprintAlignment({ sprintId, alignment: value, note: line });
      if (!result.ok) return setError(result.error);
      setEditing(false);
      router.refresh();
    });
  };

  if (!editing && alignment) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
        <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", TONE[alignment])}>{alignmentLabel(alignment)}</span>
          <p className="mt-1 text-sm text-foreground">{note}</p>
          {goals.phase && <p className="mt-0.5 text-xs text-muted-foreground">Against {goals.phase}</p>}
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Change how this week lines up with your goals"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-primary/30 bg-card p-4">
      <GoalAlignmentField goals={goals} alignment={value} note={line} onAlignment={setValue} onNote={setLine} idPrefix={`sprint_${sprintId}`} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || line.trim().length < 3}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {alignment && (
          <button type="button" onClick={() => setEditing(false)} className="text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
