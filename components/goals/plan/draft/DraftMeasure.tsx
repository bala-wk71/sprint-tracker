"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Pencil, Trash2 } from "lucide-react";
import { INPUT } from "@/components/goals/GoalFormParts";
import { CheckpointRows, type CheckpointDraft } from "@/components/goals/plan/CheckpointRows";
import { DIRECTIONS, measureSource } from "@/lib/planning/constants";
import { formatBand, formatMeasure } from "@/lib/planning/format";
import type { DraftMeasure as Measure } from "@/lib/planning/draft";
import type { Direction } from "@/lib/planning/projection";

const SMALL = `${INPUT} h-9 px-2`;
const text = (n: number | null) => (n === null ? "" : String(n));
const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(/,/g, "")));

/** "95 kg → 89–90 kg by 31 Dec 2026 → 82–85 kg by 30 Jun 2027" */
export function pathLine(m: Measure): string {
  const unit = m.kind === "ladder" ? "level" : m.unit;
  const start = m.baselineValue === null ? "from a first reading" : formatMeasure(m.baselineValue, unit);
  const stops = m.checkpoints.map((c) => {
    const when = format(new Date(`${c.date}T00:00:00`), "d MMM yyyy");
    const what = c.relative
      ? `${c.min !== null && c.min < 0 ? "down" : "up"} ${formatBand(
          c.min === null ? null : Math.abs(c.min),
          c.max === null ? null : Math.abs(c.max),
          unit
        )}`
      : formatBand(c.min, c.max, unit);
    return `${what} by ${when}${c.holdUntil ? ", held" : ""}`;
  });
  return [start, ...stops].join(" → ");
}

/** One target in a draft: its path at a glance, editable in place. */
export function DraftMeasure({
  measure,
  todayIso,
  onChange,
  onRemove,
}: {
  measure: Measure;
  todayIso: string;
  onChange: (m: Measure) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const ladder = measure.kind === "ladder";
  const source = measureSource(measure.source);

  const rows: CheckpointDraft[] = measure.checkpoints.map((c) => ({
    date: c.date,
    label: c.label ?? "",
    min: text(c.min),
    max: text(c.max),
    relative: c.relative,
    holdUntil: c.holdUntil ?? "",
  }));
  const setRows = (next: CheckpointDraft[]) =>
    onChange({
      ...measure,
      checkpoints: next.map((r) => ({
        date: r.date,
        label: r.label.trim() || null,
        min: num(r.min),
        max: ladder ? null : num(r.max),
        relative: r.relative,
        holdUntil: r.holdUntil || null,
      })),
    });

  return (
    <div className="space-y-2 rounded-lg bg-muted/40 p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {measure.label}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {ladder ? "levels" : measure.source === "manual" ? `you log it ${measure.cadence}` : source.label}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">{pathLine(measure)}</p>
          {ladder && measure.levels.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {measure.levels.map((l, i) => `L${i + 1} ${l.title}`).join(" · ")}
            </p>
          )}
        </div>
        <button type="button" onClick={() => setEditing((v) => !v)} aria-label={`Edit ${measure.label}`} className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={onRemove} aria-label={`Remove ${measure.label}`} className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {editing && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_10rem]">
            <label className="text-xs text-muted-foreground">
              Name
              <input value={measure.label} maxLength={80} onChange={(e) => onChange({ ...measure, label: e.target.value })} className={SMALL} />
            </label>
            <label className="text-xs text-muted-foreground">
              Starting at
              <input
                inputMode="decimal"
                value={text(measure.baselineValue)}
                placeholder="First reading"
                onChange={(e) => {
                  const value = num(e.target.value);
                  onChange({
                    ...measure,
                    baselineValue: value === null || Number.isNaN(value) ? null : value,
                    baselineOn: value === null ? null : measure.baselineOn ?? todayIso,
                  });
                }}
                className={SMALL}
              />
            </label>
            {!ladder && (
              <label className="text-xs text-muted-foreground">
                Better when
                <select value={measure.direction} onChange={(e) => onChange({ ...measure, direction: e.target.value as Direction })} className={SMALL}>
                  {DIRECTIONS.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {measure.source === "loan_schedule" ? (
            <p className="text-xs text-muted-foreground">
              Worked out from the EMI of {formatMeasure(measure.loanEmi, "inr")} and the last EMI on {measure.loanLastEmiOn}.
            </p>
          ) : (
            <CheckpointRows
              rows={rows}
              onChange={setRows}
              ladder={ladder}
              baseline={measure.baselineValue !== null && measure.baselineOn ? { date: measure.baselineOn, value: measure.baselineValue } : null}
              interpolate={measure.interpolate}
            />
          )}
        </div>
      )}
    </div>
  );
}
