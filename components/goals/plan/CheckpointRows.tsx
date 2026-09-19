"use client";

import { Plus, Sparkles, X } from "lucide-react";
import { INPUT } from "@/components/goals/GoalFormParts";
import { suggestQuarterCheckpoints } from "@/lib/planning/quarters";
import type { Baseline, Interpolate } from "@/lib/planning/projection";

export type CheckpointDraft = {
  date: string;
  label: string;
  min: string;
  max: string;
  relative: boolean;
  holdUntil: string;
};

export const EMPTY_CHECKPOINT: CheckpointDraft = { date: "", label: "", min: "", max: "", relative: false, holdUntil: "" };

const SMALL = `${INPUT} h-9 px-2`;
const num = (s: string) => (s.trim() === "" ? null : Number(s));

/**
 * The path as editable rows. Ladders only need a level per date; numbers get
 * a range (either end may be left open), a "change from start" switch for
 * targets like "down 4–5 cm", and an optional hold.
 */
export function CheckpointRows({
  rows,
  onChange,
  ladder,
  baseline,
  interpolate,
}: {
  rows: CheckpointDraft[];
  onChange: (rows: CheckpointDraft[]) => void;
  ladder: boolean;
  baseline: Baseline | null;
  interpolate: Interpolate;
}) {
  const update = (i: number, patch: Partial<CheckpointDraft>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const complete = rows.filter((r) => r.date && (r.min.trim() || r.max.trim()) && !r.relative);
  const suggestions =
    baseline && complete.length > 0
      ? suggestQuarterCheckpoints(
          {
            baseline,
            interpolate,
            checkpoints: complete.map((r) => ({ date: r.date, min: num(r.min), max: num(r.max), holdUntil: r.holdUntil || null })),
          },
          (n) => Math.round(n * 10) / 10
        )
      : [];

  const addSuggestions = () => {
    const added = suggestions.map((s) => ({
      date: s.date,
      label: s.label ?? "",
      min: s.min === null ? "" : String(s.min),
      max: ladder ? "" : s.max === null ? "" : String(s.max),
      relative: false,
      holdUntil: "",
    }));
    onChange([...rows, ...added].sort((a, b) => (a.date || "9").localeCompare(b.date || "9")));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-foreground">The path</p>
        <p className="text-xs text-muted-foreground">
          {ladder ? "Which level by which date." : "Where it should be on each date. Leave one end open for “under 94” or “50,000+”."}
        </p>
      </div>
      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-border p-2 sm:grid-cols-[9.5rem_minmax(0,1fr)_5.5rem_5.5rem_auto] sm:items-center sm:border-0 sm:p-0">
              <label className="sr-only" htmlFor={`cp_date_${i}`}>Checkpoint {i + 1} date</label>
              <input id={`cp_date_${i}`} type="date" value={row.date} onChange={(e) => update(i, { date: e.target.value })} className={SMALL} />
              <label className="sr-only" htmlFor={`cp_label_${i}`}>Checkpoint {i + 1} name</label>
              <input id={`cp_label_${i}`} value={row.label} maxLength={40} placeholder="End of 2026" onChange={(e) => update(i, { label: e.target.value })} className={SMALL} />
              <label className="sr-only" htmlFor={`cp_min_${i}`}>{ladder ? "Level" : "From"}</label>
              <input
                id={`cp_min_${i}`}
                inputMode="decimal"
                value={row.min}
                placeholder={ladder ? "Level" : "From"}
                onChange={(e) => update(i, { min: e.target.value })}
                className={SMALL}
              />
              {ladder ? (
                <span className="hidden sm:block" />
              ) : (
                <>
                  <label className="sr-only" htmlFor={`cp_max_${i}`}>To</label>
                  <input id={`cp_max_${i}`} inputMode="decimal" value={row.max} placeholder="To" onChange={(e) => update(i, { max: e.target.value })} className={SMALL} />
                </>
              )}
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
                aria-label={`Remove checkpoint ${i + 1}`}
                className="justify-self-end rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
              {!ladder && (
                <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground sm:col-span-5 sm:pb-1">
                  <label className="inline-flex items-center gap-1.5">
                    <input type="checkbox" checked={row.relative} onChange={(e) => update(i, { relative: e.target.checked })} />
                    Change from the start (e.g. −5 to −4)
                  </label>
                  <label className="inline-flex items-center gap-1.5">
                    Hold until
                    <input
                      type="date"
                      value={row.holdUntil}
                      min={row.date || undefined}
                      onChange={(e) => update(i, { holdUntil: e.target.value })}
                      className="h-7 rounded border border-border bg-background px-1 text-xs text-foreground"
                    />
                  </label>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange([...rows, EMPTY_CHECKPOINT])}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
        >
          <Plus className="h-3.5 w-3.5" />
          Add checkpoint
        </button>
        {suggestions.length > 0 && (
          <button
            type="button"
            onClick={addSuggestions}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Fill in {suggestions.length} quarter {suggestions.length === 1 ? "target" : "targets"}
          </button>
        )}
      </div>
    </div>
  );
}
