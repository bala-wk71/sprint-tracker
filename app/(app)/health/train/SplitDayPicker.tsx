"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { SPLIT_DAYS, splitLabel, type SplitDay } from "@/lib/health/split";
import { startSplitDay } from "./actions";

export type SplitOption = { day: SplitDay; logDate: string; exerciseCount: number };

/**
 * Push, Pull and Legs, each copied from the last time it was trained. The day
 * that is next in the rotation gets the primary button.
 */
export function SplitDayPicker({
  logDate,
  next,
  options,
  workoutId,
}: {
  logDate: string;
  next: SplitDay;
  options: SplitOption[];
  /** Fill this (empty) session instead of starting a new one. */
  workoutId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const start = (day: SplitDay) =>
    startTransition(async () => {
      setError(null);
      const result = await startSplitDay({ logDate, day, workoutId });
      if (!result.ok) return setError(result.error);
      router.refresh();
    });

  const byDay = new Map(options.map((o) => [o.day, o]));
  const ordered = [next, ...SPLIT_DAYS.map((d) => d.value).filter((d) => d !== next)];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {ordered.map((day) => {
          const option = byDay.get(day);
          const isNext = day === next;
          return (
            <button
              key={day}
              type="button"
              disabled={pending}
              onClick={() => start(day)}
              className={`flex min-w-0 flex-col items-center rounded-md px-2 py-2.5 text-sm font-medium disabled:opacity-50 ${
                isNext
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border border-border text-foreground hover:bg-accent"
              }`}
            >
              <span>{splitLabel(day)}</span>
              <span className={`mt-0.5 truncate text-[11px] font-normal ${isNext ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                {option
                  ? `${option.exerciseCount} from ${format(new Date(`${option.logDate}T00:00:00`), "d MMM")}`
                  : "start fresh"}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Next in your split is {splitLabel(next)}. Exercises come from the last time; the sets are yours to fill.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
