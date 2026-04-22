import { Flame, CalendarCheck } from "lucide-react";
import type { StreakResult } from "@/lib/streaks";

function formatLastActive(iso: string | null): string {
  if (!iso) return "";
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yestIso = yesterday.toISOString().slice(0, 10);
  if (iso === today) return "last active: today";
  if (iso === yestIso) return "last active: yesterday";
  // Format as "through Apr 13" style
  const d = new Date(`${iso}T00:00:00`);
  return `through ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

interface StreakCardsProps {
  daily: StreakResult;
  weekly: StreakResult;
}

export function StreakCards({ daily, weekly }: StreakCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Daily streak */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Flame className="h-4 w-4 text-[hsl(var(--strong-signal))]" />
          <span className="text-sm font-medium text-muted-foreground">Daily streak</span>
        </div>
        {daily.current > 0 ? (
          <>
            <p className="text-3xl font-bold text-foreground">
              {daily.current}
              <span className="text-base font-normal text-muted-foreground ml-1">
                {daily.current === 1 ? "day" : "days"}
              </span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {formatLastActive(daily.lastActiveDate)}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Start today</p>
        )}
      </div>

      {/* Weekly streak */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <CalendarCheck className="h-4 w-4 text-[hsl(var(--strong-signal))]" />
          <span className="text-sm font-medium text-muted-foreground">Weekly streak</span>
        </div>
        {weekly.current > 0 ? (
          <>
            <p className="text-3xl font-bold text-foreground">
              {weekly.current}
              <span className="text-base font-normal text-muted-foreground ml-1">
                {weekly.current === 1 ? "week" : "weeks"}
              </span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {formatLastActive(weekly.lastActiveDate)}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Complete a sprint to begin</p>
        )}
      </div>
    </div>
  );
}
