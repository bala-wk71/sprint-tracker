"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ChevronDown, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { INPUT } from "@/components/goals/GoalFormParts";
import { GOAL_LEVELS, LEVER_SOURCES, goalLevelLabel, type LeverSource } from "@/lib/planning/constants";
import type { DraftGoal, DraftLever, DraftStream } from "@/lib/planning/draft";
import { DraftMeasure } from "./DraftMeasure";

const SMALL = `${INPUT} h-9 px-2`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One proposed goal: a one-line summary that opens into everything it will create. */
export function DraftGoalCard({
  goal,
  streams,
  parentTitle,
  todayIso,
  onChange,
  moveTargets,
  onMoveLever,
}: {
  goal: DraftGoal;
  streams: DraftStream[];
  parentTitle: string | null;
  todayIso: string;
  onChange: (g: DraftGoal) => void;
  /** Other goals an action can be moved to, when it was put on the wrong one. */
  moveTargets: { key: string; title: string }[];
  onMoveLever: (index: number, toKey: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<DraftGoal>) => onChange({ ...goal, ...patch });
  const setLever = (i: number, patch: Partial<DraftLever>) =>
    set({ levers: goal.levers.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const level = goalLevelLabel(goal.level);
  const counts = [
    goal.measures.length ? plural(goal.measures.length, "target", "targets") : null,
    goal.levers.length ? plural(goal.levers.length, "weekly action", "weekly actions") : null,
    goal.steps.length ? plural(goal.steps.length, "step", "steps") : null,
  ].filter(Boolean);

  return (
    <li className={cn("rounded-lg border border-border", !goal.include && "opacity-60")}>
      <div className="flex items-start gap-3 p-3">
        <input
          type="checkbox"
          checked={goal.include}
          onChange={(e) => set({ include: e.target.checked })}
          aria-label={`Include ${goal.title}`}
          className="mt-1 h-4 w-4 shrink-0"
        />
        <button type="button" onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <span className="block font-medium text-foreground">
            {goal.existingId && <span className="mr-1.5 text-xs font-normal text-primary">Existing goal ·</span>}
            {goal.title}
          </span>
          <span className="block text-xs text-muted-foreground">
            {[
              level,
              `ends ${format(new Date(`${goal.targetDate}T00:00:00`), "d MMM yyyy")}`,
              parentTitle ? `under “${parentTitle}”` : null,
              ...counts,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </button>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-label={open ? "Collapse" : "Expand"} className="rounded p-1 text-muted-foreground hover:bg-accent">
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {open && (
        <div className="space-y-4 border-t border-border p-3">
          {!goal.existingId && (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-muted-foreground sm:col-span-2">
                Title
                <input value={goal.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} className={SMALL} />
              </label>
              <label className="text-xs text-muted-foreground">
                Ends
                <input type="date" min={todayIso} value={goal.targetDate} onChange={(e) => e.target.value && set({ targetDate: e.target.value })} className={SMALL} />
              </label>
              <label className="text-xs text-muted-foreground">
                Level
                <select value={goal.level ?? ""} onChange={(e) => set({ level: (e.target.value || null) as DraftGoal["level"] })} className={SMALL}>
                  <option value="">—</option>
                  {GOAL_LEVELS.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </label>
              {streams.length > 0 && (
                <label className="text-xs text-muted-foreground sm:col-span-2">
                  Stream
                  <select value={goal.streamKey ?? ""} onChange={(e) => set({ streamKey: e.target.value || null })} className={SMALL}>
                    <option value="">No stream</option>
                    {streams.map((s) => (
                      <option key={s.key} value={s.key}>{s.name}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}

          {goal.measures.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Targets</p>
              {goal.measures.map((m, i) => (
                <DraftMeasure
                  key={i}
                  measure={m}
                  todayIso={todayIso}
                  onChange={(next) => set({ measures: goal.measures.map((x, j) => (j === i ? next : x)) })}
                  onRemove={() => set({ measures: goal.measures.filter((_, j) => j !== i) })}
                />
              ))}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Weekly actions</p>
            {goal.levers.map((l, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <input value={l.title} maxLength={80} aria-label="Action" onChange={(e) => setLever(i, { title: e.target.value })} className={SMALL} />
                  <button type="button" onClick={() => set({ levers: goal.levers.filter((_, j) => j !== i) })} aria-label={`Remove ${l.title}`} className="rounded p-2 text-muted-foreground hover:bg-accent hover:text-destructive">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {moveTargets.length > 0 && (
                  <select
                    value=""
                    aria-label={`Move ${l.title} to another goal`}
                    onChange={(e) => e.target.value && onMoveLever(i, e.target.value)}
                    className="h-7 max-w-full rounded border border-border bg-background px-1 text-xs text-muted-foreground"
                  >
                    <option value="">Move to another goal…</option>
                    {moveTargets.map((t) => (
                      <option key={t.key} value={t.key}>{t.title}</option>
                    ))}
                  </select>
                )}
                <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] gap-2 pr-9">
                  <select value={l.source} aria-label="Counted by" onChange={(e) => setLever(i, { source: e.target.value as LeverSource })} className={SMALL}>
                    {LEVER_SOURCES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  <input
                    inputMode="decimal"
                    value={l.target}
                    aria-label={`Target per ${l.period}`}
                    title="Target"
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isFinite(n) && n > 0) setLever(i, { target: n });
                    }}
                    className={SMALL}
                  />
                  <input
                    inputMode="decimal"
                    value={l.floor ?? ""}
                    aria-label="Minimum in a hard week"
                    title="Minimum in a hard week"
                    placeholder="min"
                    onChange={(e) => {
                      const n = e.target.value.trim() === "" ? null : Number(e.target.value);
                      if (n === null || Number.isFinite(n)) setLever(i, { floor: n });
                    }}
                    className={SMALL}
                  />
                </div>
              </div>
            ))}
            {goal.levers.length > 0 && <p className="text-xs text-muted-foreground">Each action: how it&apos;s counted, its target, and the minimum for a hard week (per {goal.levers[0].period}).</p>}
            <button
              type="button"
              onClick={() => set({ levers: [...goal.levers, { title: "New action", source: "tick", period: "week", target: 3, floor: 2 }] })}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <Plus className="h-3.5 w-3.5" />
              Add an action
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Steps</p>
            {goal.steps.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={s}
                  maxLength={200}
                  aria-label={`Step ${i + 1}`}
                  onChange={(e) => set({ steps: goal.steps.map((x, j) => (j === i ? e.target.value : x)) })}
                  className={SMALL}
                />
                <button type="button" onClick={() => set({ steps: goal.steps.filter((_, j) => j !== i) })} aria-label={`Remove step ${i + 1}`} className="rounded p-2 text-muted-foreground hover:bg-accent hover:text-destructive">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {goal.steps.length < 30 && (
              <button type="button" onClick={() => set({ steps: [...goal.steps, ""] })} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                <Plus className="h-3.5 w-3.5" />
                Add a step
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
