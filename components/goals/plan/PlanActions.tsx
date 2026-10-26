"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { Baseline } from "@/lib/planning/projection";
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
