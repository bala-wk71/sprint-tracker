"use client";

import { useRouter } from "next/navigation";
import { addDays, format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  date: string;
  todayIso: string;
};

// Format locally — mixing a local-midnight parse with toISOString() (UTC)
// drops a day for any timezone ahead of UTC.
function shiftDate(date: string, days: number): string {
  return format(addDays(new Date(`${date}T00:00:00`), days), "yyyy-MM-dd");
}

export function DateNav({ date, todayIso }: Props) {
  const router = useRouter();

  const go = (next: string) => {
    if (next === todayIso) {
      router.push("/daily");
    } else {
      router.push(`/daily?date=${next}`);
    }
  };

  const labelDate = new Date(`${date}T00:00:00`);
  const isToday = date === todayIso;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => go(shiftDate(date, -1))}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Prev</span>
        </button>
        <input
          type="date"
          value={date}
          max={todayIso}
          onChange={(e) => e.target.value && go(e.target.value)}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          onClick={() => go(shiftDate(date, 1))}
          disabled={isToday}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-40"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        {!isToday && (
          <button
            type="button"
            onClick={() => go(todayIso)}
            className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Today
          </button>
        )}
      </div>
      <span className="text-sm font-medium text-muted-foreground">
        {format(labelDate, "EEE, MMM d, yyyy")}
      </span>
    </div>
  );
}
