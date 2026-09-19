"use client";

import { useOptimistic, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FIELD_LABEL, INPUT } from "@/components/goals/GoalFormParts";
import { LEVER_SOURCES, type LeverSource } from "@/lib/planning/constants";
import type { LeverSummary } from "@/lib/planning/load";
import { archiveLever, saveLever, tickLever } from "@/app/(app)/goals/plan-actions";

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

/** The weekly actions behind a goal, with a small form to add one. */
export function LeverList({ goalId, levers, readOnly = false }: { goalId: string; levers: LeverSummary[]; readOnly?: boolean }) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-2">
      {levers.length > 0 ? (
        <ul className="divide-y divide-border">
          {levers.map((l) => (
            <LeverRow
              key={l.id}
              lever={l}
              readOnly={readOnly}
              extra={readOnly ? null : <RemoveLever id={l.id} goalId={goalId} title={l.title} />}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Big numbers move slowly. Add the actions that move them (workouts, practice hours, sales calls), so every week shows progress.
        </p>
      )}
      {!readOnly &&
        (adding ? (
          <LeverForm goalId={goalId} onDone={() => setAdding(false)} />
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            <Plus className="h-3.5 w-3.5" />
            Add a weekly action
          </button>
        ))}
    </div>
  );
}

function RemoveLever({ id, goalId, title }: { id: string; goalId: string; title: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        window.confirm(`Remove "${title}"? Its history is kept.`) &&
        startTransition(async () => {
          await archiveLever(id, goalId);
          router.refresh();
        })
      }
      aria-label={`Remove ${title}`}
      className="absolute -right-1 top-1 rounded p-1 text-muted-foreground opacity-0 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}

function LeverForm({ goalId, onDone }: { goalId: string; onDone: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [source, setSource] = useState<LeverSource>("tick");
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [target, setTarget] = useState("4");
  const [floor, setFloor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const targetN = Number(target);
  const floorN = floor.trim() === "" ? Math.ceil(targetN / 2) : Number(floor);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!Number.isFinite(targetN) || targetN <= 0) return setError("The target needs to be a number above zero.");
    if (!Number.isFinite(floorN)) return setError("The minimum should be a number.");
    setError(null);
    startTransition(async () => {
      const result = await saveLever({ goalId, title, source, period, target: targetN, floor: floorN });
      if (!result.ok) return setError(result.error);
      onDone();
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-border p-3">
      <div>
        <label htmlFor="lever_title" className={FIELD_LABEL}>Action</label>
        <input id="lever_title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Strength session, practice hours, quotes sent" className={INPUT} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="lever_source" className={FIELD_LABEL}>Counted by</label>
          <select id="lever_source" value={source} onChange={(e) => setSource(e.target.value as LeverSource)} className={INPUT}>
            {LEVER_SOURCES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">{LEVER_SOURCES.find((s) => s.value === source)?.hint}</p>
        </div>
        <div>
          <label htmlFor="lever_period" className={FIELD_LABEL}>Per</label>
          <select id="lever_period" value={period} onChange={(e) => setPeriod(e.target.value as "week" | "month")} className={INPUT}>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </div>
        <div>
          <label htmlFor="lever_target" className={FIELD_LABEL}>Target{source === "linked_hours" ? " (hours)" : ""}</label>
          <input id="lever_target" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} className={INPUT} />
        </div>
        <div>
          <label htmlFor="lever_floor" className={FIELD_LABEL}>Minimum in a hard week</label>
          <input id="lever_floor" inputMode="decimal" value={floor} onChange={(e) => setFloor(e.target.value)} placeholder={Number.isFinite(targetN) ? String(Math.ceil(targetN / 2)) : ""} className={INPUT} />
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {pending ? "Adding…" : "Add action"}
        </button>
        <button type="button" onClick={onDone} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
      </div>
    </form>
  );
}
