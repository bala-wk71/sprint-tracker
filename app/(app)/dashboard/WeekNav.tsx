"use client";

import { useRouter } from "next/navigation";
import { addDays, format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  weekStart: string;
  currentWeekStart: string;
  basePath?: string;
};

// Format locally — mixing a local-midnight parse with toISOString() (UTC)
// drops a day for any timezone ahead of UTC.
function shiftWeek(weekStart: string, weeks: number): string {
  return format(
    addDays(new Date(`${weekStart}T00:00:00`), weeks * 7),
    "yyyy-MM-dd"
  );
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
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => go(shiftWeek(weekStart, -1))}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Prev week</span>
        </button>
        <button
          type="button"
          onClick={() => go(shiftWeek(weekStart, 1))}
          disabled={isCurrent}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-40"
        >
          <span className="hidden sm:inline">Next week</span>
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
      </div>
      <span className="text-sm font-medium text-muted-foreground">
        {startLabel} – {endLabel}
      </span>
    </div>
  );
}
