"use client";

import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  weekStart: string;
  currentWeekStart: string;
  basePath?: string;
};

function shiftWeek(weekStart: string, weeks: number): string {
  const d = new Date(`${weekStart}T00:00:00`);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

export function WeekNav({
  weekStart,
  currentWeekStart,
  basePath = "/dashboard",
}: Props) {
  const router = useRouter();

  const go = (next: string) => {
    if (next === currentWeekStart) {
      router.push(basePath);
    } else {
      router.push(`${basePath}?week=${next}`);
    }
  };

  const startLabel = format(new Date(`${weekStart}T00:00:00`), "MMM d");
  const endDate = new Date(`${weekStart}T00:00:00`);
  endDate.setDate(endDate.getDate() + 6);
  const endLabel = format(endDate, "MMM d, yyyy");
  const isCurrent = weekStart === currentWeekStart;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => go(shiftWeek(weekStart, -1))}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Prev week
      </button>
      <button
        type="button"
        onClick={() => go(shiftWeek(weekStart, 1))}
        disabled={isCurrent}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-40"
      >
        Next week
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
      {!isCurrent && (
        <button
          type="button"
          onClick={() => go(currentWeekStart)}
          className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          This week
        </button>
      )}
      <span className="ml-2 text-sm font-medium text-muted-foreground">
        {startLabel} – {endLabel}
      </span>
    </div>
  );
}
