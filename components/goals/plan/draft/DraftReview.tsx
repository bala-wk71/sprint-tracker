"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { INPUT } from "@/components/goals/GoalFormParts";
import { GOAL_AREAS, goalArea, type GoalArea } from "@/lib/goals/constants";
import type { DraftGoal, PlanDraft } from "@/lib/planning/draft";
import { savePlanDraft } from "@/app/(app)/goals/plan/actions";
import { DraftGoalCard } from "./DraftGoalCard";

const SMALL = `${INPUT} h-9 px-2`;

/**
 * Everything a draft would create, editable before anything is saved. Nothing
 * reaches the database until "Save plan".
 */
export function DraftReview({
  draft,
  warnings,
  todayIso,
  existingStreams,
  onChange,
  onSaved,
  navigateOnSave = true,
}: {
  draft: PlanDraft;
  warnings: string[];
  todayIso: string;
  /** Names already in use; a draft stream with the same name joins it instead of duplicating it. */
  existingStreams: string[];
  onChange: (d: PlanDraft) => void;
  onSaved: () => void;
  /** Off where the page itself shows the result (a report's proposal). */
  navigateOnSave?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saveNotes, setSaveNotes] = useState(true);
  const [pending, startTransition] = useTransition();
  const existing = new Set(existingStreams.map((s) => s.toLowerCase()));

  const setGoal = (key: string, next: DraftGoal) =>
    onChange({ ...draft, goals: draft.goals.map((g) => (g.key === key ? next : g)) });
  const moveLever = (fromKey: string, index: number, toKey: string) => {
    const lever = draft.goals.find((g) => g.key === fromKey)?.levers[index];
    if (!lever) return;
    onChange({
      ...draft,
      goals: draft.goals.map((g) =>
        g.key === fromKey
          ? { ...g, levers: g.levers.filter((_, i) => i !== index) }
          : g.key === toKey
            ? { ...g, levers: [...g.levers, lever] }
            : g
      ),
    });
  };
  const titleOf = new Map(draft.goals.map((g) => [g.key, g.title]));
  const included = draft.goals.filter((g) => g.include);
  const totals = {
    goals: included.length,
    targets: included.reduce((n, g) => n + g.measures.length, 0),
    actions: included.reduce((n, g) => n + g.levers.length, 0),
    steps: included.reduce((n, g) => n + g.steps.length, 0),
  };
  const attached = included.filter((g) => g.existingId).length;
  const groups = [
    ...draft.streams.map((s) => ({ key: s.key, name: s.name, area: s.area as GoalArea, goals: draft.goals.filter((g) => g.streamKey === s.key) })),
    { key: "", name: "No stream", area: null, goals: draft.goals.filter((g) => !g.streamKey) },
  ].filter((group) => group.goals.length > 0);

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await savePlanDraft(draft, { saveNotes });
      if (!result.ok) return setError(result.error);
      onSaved();
      if (!navigateOnSave) return router.refresh();
      router.push(result.data.firstGoalId && totals.goals === 1 ? `/goals/${result.data.firstGoalId}` : "/goals");
      router.refresh();
    });
  };

  return (
    <section className="space-y-5 rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">Review your plan</h2>
        <p className="text-xs text-muted-foreground">
          {(
            [
              // Goals the plan only attaches to aren't created, so they aren't counted as new.
              attached ? [totals.goals - attached, "new goal", "new goals"] : [totals.goals, "goal", "goals"],
              [totals.targets, "target", "targets"],
              [totals.actions, "weekly action", "weekly actions"],
              [totals.steps, "step", "steps"],
            ] as [number, string, string][]
          )
            .filter(([n], i) => i === 0 || n > 0)
            .map(([n, one, many]) => `${n} ${n === 1 ? one : many}`)
            .join(" · ")}
        </p>
      </div>
      <p className="-mt-3 text-sm text-muted-foreground">
        Nothing is saved yet. Untick what you don&apos;t want, open a goal to change it, then save. New goals start private.
      </p>

      {warnings.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground">
          {warnings.map((w) => (
            <li key={w} className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
              {w}
            </li>
          ))}
        </ul>
      )}

      {draft.questions.length > 0 && (
        <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm">
          <p className="font-medium text-foreground">Worth a look</p>
          <ul className="space-y-1 text-muted-foreground">
            {draft.questions.map((q) => (
              <li key={q} className="flex gap-2">
                <HelpCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {q}
              </li>
            ))}
          </ul>
        </div>
      )}

      {draft.streams.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Streams</h3>
          <ul className="space-y-2">
            {draft.streams.map((s, i) => {
              const joins = existing.has(s.name.trim().toLowerCase());
              return (
                <li key={s.key} className={cn("grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[auto_minmax(0,1fr)_9rem_6rem]", !s.include && "opacity-60")}>
                  <input
                    type="checkbox"
                    checked={s.include}
                    aria-label={`Include ${s.name}`}
                    onChange={(e) => onChange({ ...draft, streams: draft.streams.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)) })}
                    className="h-4 w-4"
                  />
                  <div className="min-w-0">
                    <input
                      value={s.name}
                      maxLength={60}
                      aria-label="Stream name"
                      onChange={(e) => onChange({ ...draft, streams: draft.streams.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
                      className={SMALL}
                    />
                    {joins && <p className="mt-0.5 text-xs text-muted-foreground">Joins your existing stream</p>}
                  </div>
                  {/* An existing stream keeps its own area and hours; saving changes neither. */}
                  {!joins && (
                    <>
                      <select
                        value={s.area}
                        aria-label="Life area"
                        onChange={(e) => onChange({ ...draft, streams: draft.streams.map((x, j) => (j === i ? { ...x, area: e.target.value as GoalArea } : x)) })}
                        className={cn(SMALL, "col-start-2 sm:col-start-auto")}
                      >
                        {GOAL_AREAS.map((a) => (
                          <option key={a.value} value={a.value}>{a.label}</option>
                        ))}
                      </select>
                      <input
                        inputMode="decimal"
                        value={s.weeklyHours ?? ""}
                        placeholder="h/week"
                        aria-label="Hours a week"
                        onChange={(e) => {
                          const n = e.target.value.trim() === "" ? null : Number(e.target.value);
                          if (n === null || (Number.isFinite(n) && n >= 0 && n <= 168)) {
                            onChange({ ...draft, streams: draft.streams.map((x, j) => (j === i ? { ...x, weeklyHours: n } : x)) });
                          }
                        }}
                        className={cn(SMALL, "col-start-2 sm:col-start-auto")}
                      />
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">An unticked stream isn&apos;t created; its goals are saved without a stream.</p>
        </div>
      )}

      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.key || "none"} className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              {group.area && <span className={cn("h-2 w-2 rounded-full", goalArea(group.area).dot)} aria-hidden />}
              {group.name}
            </h3>
            <ul className="space-y-2">
              {group.goals.map((g) => (
                <DraftGoalCard
                  key={g.key}
                  goal={g}
                  streams={draft.streams}
                  parentTitle={g.parentKey ? titleOf.get(g.parentKey) ?? null : null}
                  todayIso={todayIso}
                  onChange={(next) => setGoal(g.key, next)}
                  moveTargets={draft.goals.filter((x) => x.key !== g.key && x.include).map((x) => ({ key: x.key, title: x.title }))}
                  onMoveLever={(i, to) => moveLever(g.key, i, to)}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>

      {draft.notes.trim() && (
        <details className="rounded-lg border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium text-foreground">Notes kept for reference (not tracked)</summary>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{draft.notes}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Decision rules like &ldquo;quit only when all four are true&rdquo; become trackable in a later update.
          </p>
        </details>
      )}

      {draft.notes.trim() && (
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={saveNotes} onChange={(e) => setSaveNotes(e.target.checked)} className="h-4 w-4" />
          Save the notes as a page in Notes
        </label>
      )}

      {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || totals.goals === 0}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending
            ? "Saving…"
            : attached
              ? "Save plan"
              : totals.goals === 1
                ? "Save this goal"
                : `Save ${totals.goals} goals`}
        </button>
        {pending && <span className="text-xs text-muted-foreground">Creating streams, goals and targets…</span>}
      </div>
    </section>
  );
}
