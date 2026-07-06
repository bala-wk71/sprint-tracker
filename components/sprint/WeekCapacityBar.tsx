"use client";

import { cn } from "@/lib/utils";
import { WEEK_HOURS } from "@/lib/constants";

export function formatHours(hours: number): string {
  return `${Number(hours.toFixed(1))}h`;
}

/**
 * Shows how much of the week's 168 hours are planned, and how much is left.
 * Turns amber when nearly full, red when over capacity.
 */
export function WeekCapacityBar({
  plannedHours,
  className,
}: {
  plannedHours: number;
  className?: string;
}) {
  const planned = Number.isFinite(plannedHours) ? Math.max(plannedHours, 0) : 0;
  const remaining = WEEK_HOURS - planned;
  const over = remaining < 0;
  const pct = Math.min((planned / WEEK_HOURS) * 100, 100);

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-background px-3 py-2.5",
        over && "border-destructive/50",
        className
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs">
        <p className="text-muted-foreground">
          <span className="text-sm font-semibold text-foreground">
            {formatHours(planned)}
          </span>{" "}
          planned <span className="opacity-70">· week has {WEEK_HOURS}h</span>
        </p>
        <p
          className={cn(
            "font-medium",
            over ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {over
            ? `${formatHours(-remaining)} over capacity`
            : `${formatHours(remaining)} left to plan`}
        </p>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            over ? "bg-destructive" : pct > 85 ? "bg-amber-500" : "bg-primary"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
