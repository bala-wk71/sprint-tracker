"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_COPY, measureSource, type LadderLevel } from "@/lib/planning/constants";
import { coveredLabel, headline } from "@/lib/planning/wording";
import { formatMeasure } from "@/lib/planning/format";
import type { MeasureSummary } from "@/lib/planning/summary";
import { MeasureChart } from "./MeasureChart";
import { MeasureEditor } from "./MeasureEditor";
import { LogReadingForm } from "./LogReadingForm";
import { ForecastNote } from "./ForecastNote";

function levelsOf(scale: unknown): LadderLevel[] {
  if (!Array.isArray(scale)) return [];
  return scale.map((l, i) => ({ level: i + 1, title: String(l?.title ?? ""), proof: String(l?.proof ?? "") }));
}

export function StatusChip({ status }: { status: keyof typeof STATUS_COPY }) {
  const copy = STATUS_COPY[status];
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", copy.tone)}>{copy.label}</span>;
}

/**
 * One measure of a goal: the headline read, the path chart, and a quick way
 * to log. `readOnly` hides editing for closed goals and reviewers.
 */
export function MeasureCard({
  summary,
  goalId,
  todayIso,
  readOnly = false,
}: {
  summary: MeasureSummary;
  goalId: string;
  todayIso: string;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [logging, setLogging] = useState(false);
  const { measure } = summary;
  const ladder = measure.kind === "ladder";
  const levels = ladder ? levelsOf(measure.scale) : null;
  const auto = measure.source !== "manual" && measure.source !== "loan_schedule";
  const covered = coveredLabel(summary);

  if (editing) {
    return (
      <MeasureEditor
        goalId={goalId}
        todayIso={todayIso}
        measure={measure}
        checkpoints={summary.checkpoints}
        knownBaseline={summary.path.baseline}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <article className="space-y-3 rounded-xl border border-border p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <h3 className="flex flex-wrap items-center gap-2 font-medium text-foreground">
            {measure.label}
            <StatusChip status={summary.status} />
            {summary.due && !readOnly && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                Reading due
              </span>
            )}
          </h3>
          <p className="text-sm text-foreground/80">{headline(summary, todayIso)}</p>
          <p className="text-xs text-muted-foreground">
            {[
              summary.latest ? `Latest ${formatMeasure(summary.latest.value, measure.unit)} on ${format(new Date(`${summary.latest.date}T00:00:00`), "d MMM")}` : null,
              summary.best !== null && summary.latest && summary.best !== summary.latest.value
                ? `best ${formatMeasure(summary.best, measure.unit)}`
                : null,
              covered,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit path
          </button>
        )}
      </header>

      <MeasureChart
        path={summary.path}
        points={summary.points}
        unit={measure.unit}
        todayIso={todayIso}
        label={measure.label}
        forecast={summary.forecast?.line}
      />
      <ForecastNote summary={summary} todayIso={todayIso} readOnly={readOnly} />

      {levels && levels.length > 0 && (
        <ol className="grid gap-1 text-xs sm:grid-cols-2">
          {levels.map((l) => {
            const reached = (summary.latest?.value ?? 0) >= l.level;
            return (
              <li key={l.level} className={cn("flex gap-2 rounded-md px-2 py-1", reached ? "bg-primary/10 text-foreground" : "text-muted-foreground")}>
                <span className="font-semibold">L{l.level}</span>
                <span className="min-w-0">
                  {l.title || "—"}
                  {l.proof && <span className="block text-muted-foreground">Proof: {l.proof}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {!readOnly &&
        (auto ? (
          <p className="text-xs text-muted-foreground">
            Fills in from your{" "}
            <Link href="/health/body" className="font-medium text-primary hover:underline">
              Health body log
            </Link>
            . {measureSource(measure.source).hint}
          </p>
        ) : logging || summary.due ? (
          <LogReadingForm
            measureId={measure.id}
            goalId={goalId}
            unit={measure.unit}
            levels={levels}
            todayIso={todayIso}
            onDone={() => setLogging(false)}
          />
        ) : (
          <button type="button" onClick={() => setLogging(true)} className="text-xs font-medium text-primary hover:underline">
            {measure.source === "loan_schedule" ? "Enter the actual balance (after a prepayment)" : ladder ? "Log a level reached" : "Log a reading"}
          </button>
        ))}
    </article>
  );
}
