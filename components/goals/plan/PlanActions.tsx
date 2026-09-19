"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, Plus } from "lucide-react";
import type { Baseline } from "@/lib/planning/projection";
import { addQuarterGoal } from "@/app/(app)/goals/plan-actions";
import { MeasureEditor } from "./MeasureEditor";

/** "Add a measure" that opens the editor in place. */
export function AddMeasure({ goalId, todayIso, knownBaseline = null, prominent = false }: {
  goalId: string;
  todayIso: string;
  knownBaseline?: Baseline | null;
  prominent?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (open) {
    return <MeasureEditor goalId={goalId} todayIso={todayIso} knownBaseline={knownBaseline} onDone={() => setOpen(false)} />;
  }
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={
        prominent
          ? "inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          : "inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      }
    >
      <Plus className={prominent ? "h-4 w-4" : "h-3.5 w-3.5"} />
      {prominent ? "Set a target and path" : "Add another measure"}
    </button>
  );
}

/** Adds this quarter's (or next quarter's) goal under a destination and opens it. */
export function AddQuarterGoal({ goalId, which, label }: { goalId: string; which: "current" | "next"; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await addQuarterGoal(goalId, which);
            if (!result.ok) return setError(result.error);
            router.push(`/goals/${result.data.id}`);
          })
        }
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
      >
        <CalendarRange className="h-3.5 w-3.5" />
        {pending ? "Adding…" : label}
      </button>
      {error && <span className="mt-1 text-xs text-destructive">{error}</span>}
    </span>
  );
}
