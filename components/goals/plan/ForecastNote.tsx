"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { TrendingUp } from "lucide-react";
import { forecastLine } from "@/lib/planning/wording";
import type { MeasureSummary } from "@/lib/planning/summary";
import { moveCheckpoint } from "@/app/(app)/goals/plan-actions";

const short = (iso: string) => format(new Date(`${iso}T00:00:00`), "d MMM yyyy");

/**
 * Where the recent pace lands. When the pace a checkpoint needs is past
 * anything managed so far, it offers to move that checkpoint to where the
 * pace actually arrives; nothing moves unless the person says so.
 */
export function ForecastNote({ summary, todayIso, readOnly }: { summary: MeasureSummary; todayIso: string; readOnly: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const read = forecastLine(summary, todayIso);
  if (!read || !summary.forecast) return null;
  const { target, arrives } = summary.forecast;
  const canMove = read.replan && !readOnly && arrives && arrives > target.date;

  const move = () =>
    start(async () => {
      setError(null);
      const res = await moveCheckpoint({
        measureId: summary.measure.id,
        goalId: summary.measure.goal_id,
        fromDate: target.date,
        toDate: arrives!,
      });
      if (!res.ok) setError(res.error);
      else router.refresh();
    });

  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <p className="flex min-w-0 flex-1 items-start gap-1.5">
        <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{read.text}</span>
      </p>
      {canMove && (
        <button
          type="button"
          onClick={move}
          disabled={pending}
          className="shrink-0 font-medium text-primary hover:underline disabled:opacity-50"
        >
          {pending ? "Moving…" : `Move ${short(target.date)} to ${short(arrives!)}`}
        </button>
      )}
      {error && <p className="w-full text-destructive">{error}</p>}
    </div>
  );
}
