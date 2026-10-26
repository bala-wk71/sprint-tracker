"use client";

import { useOptimistic, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { LEVER_SOURCES } from "@/lib/planning/constants";
import type { LeverSummary } from "@/lib/planning/load";
import { tickLever } from "@/app/(app)/goals/plan-actions";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** "3 of 4 this week", worded so what's done leads and the minimum is visible. */
export function leverLine(l: Pick<LeverSummary, "done" | "target" | "floor" | "period" | "source">) {
  const unit = l.source === "linked_hours" ? "h" : "";
  const when = l.period === "month" ? "this month" : "this week";
  if (l.done >= l.target) return `${fmt(l.done)}${unit} of ${fmt(l.target)}${unit} ${when}: target hit`;
  const left = l.target - l.done;
  return `${fmt(l.done)}${unit} of ${fmt(l.target)}${unit} ${when} · ${fmt(left)}${unit} more hits it`;
}

export function LeverRow({
  lever,
  readOnly = false,
  goalTitle,
  extra,
}: {
  lever: LeverSummary;
  readOnly?: boolean;
  goalTitle?: string;
  /** Rendered in the row's corner, shown on hover (e.g. remove). */
  extra?: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimistic, bump] = useOptimistic(lever.done, (done: number, delta: number) => Math.max(0, done + delta));
  const [error, setError] = useState<string | null>(null);

  const tick = (delta: 1 | -1) =>
    startTransition(async () => {
      bump(delta);
      const result = await tickLever(lever.id, delta);
      if (!result.ok) setError(result.error);
      router.refresh();
    });

  const pct = Math.min(100, (optimistic / lever.target) * 100);
  const floorPct = Math.min(100, (lever.floor / lever.target) * 100);
  const hit = optimistic >= lever.target;

  return (
    <li className="group relative space-y-1.5 py-2.5">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{lever.title}</p>
          {goalTitle && <p className="truncate text-xs text-muted-foreground">{goalTitle}</p>}
        </div>
        {lever.source === "tick" && !readOnly ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => tick(-1)}
              disabled={pending || lever.doneToday <= 0}
              aria-label={`Undo one ${lever.title}`}
              className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-40"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => tick(1)}
              disabled={pending}
              aria-label={`Did ${lever.title} today`}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              <Plus className="h-3.5 w-3.5" />
              Done
            </button>
          </div>
        ) : (
          <span className="shrink-0 text-xs text-muted-foreground">
            {LEVER_SOURCES.find((s) => s.value === lever.source)?.label}
          </span>
        )}
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className={cn("h-full rounded-full transition-all", hit ? "bg-progress-good" : "bg-primary")} style={{ width: `${pct}%` }} />
        {lever.floor > 0 && lever.floor < lever.target && (
          <span className="absolute top-0 h-full w-0.5 bg-background" style={{ left: `${floorPct}%` }} />
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {leverLine({ ...lever, done: optimistic })}
        {lever.floor > 0 && lever.floor < lever.target ? ` · minimum ${fmt(lever.floor)}` : ""}
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {extra}
    </li>
  );
}
