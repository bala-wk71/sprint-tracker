"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { addGoalStep, deleteGoalStep, renameGoalStep, setGoalStepDone } from "@/app/(app)/goals/step-actions";
import { setStepPhase } from "@/app/(app)/goals/phase-actions";
import { nextPhaseOf, phaseLabel, phaseWhen, type Phase } from "@/lib/planning/phases";
import { announceXp } from "@/lib/xpToast";

type Step = { id: string; title: string; done_at: string | null; phase_id?: string | null };

const PHASE_CHIP: Record<Phase["status"], { label: string; tone: string }> = {
  done: { label: "Done", tone: "text-[hsl(var(--progress-good))]" },
  current: { label: "Now", tone: "text-primary" },
  upcoming: { label: "", tone: "" },
};

const SELECT =
  "h-8 rounded-md border border-border bg-background px-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-primary sm:text-sm";

/**
 * A goal's checklist. On a long-range goal (when `phases` is given) the steps
 * sit under the phase they're planned for, and each can be moved between them.
 */
export function StepList({
  goalId,
  steps,
  readOnly,
  phases,
}: {
  goalId: string;
  steps: Step[];
  readOnly: boolean;
  phases?: Phase[];
}) {
  const router = useRouter();
  const withPhases = Boolean(phases && phases.length > 0);
  const [newTitle, setNewTitle] = useState("");
  const [newPhase, setNewPhase] = useState<string>(phases ? nextPhaseOf(phases)?.id ?? "" : "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; title: string; phaseId: string } | null>(null);

  const run = (action: () => Promise<{ ok: true; xp?: number } | { ok: false; error: string }>, after?: () => void) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      announceXp(result.xp, "Goal step done");
      after?.();
      router.refresh();
    });
  };

  const saveEdit = () => {
    if (!editing) return;
    const step = steps.find((s) => s.id === editing.id);
    if (!step) return setEditing(null);
    const renamed = editing.title.trim() !== step.title;
    const moved = withPhases && editing.phaseId !== (step.phase_id ?? "");
    if (!renamed && !moved) return setEditing(null);
    run(async () => {
      if (renamed) {
        const r = await renameGoalStep(editing.id, editing.title);
        if (!r.ok) return r;
      }
      return moved ? setStepPhase(editing.id, editing.phaseId || null) : { ok: true as const };
    }, () => setEditing(null));
  };

  const add = () => {
    if (!newTitle.trim()) return;
    run(() => addGoalStep(goalId, newTitle, withPhases ? newPhase || null : null), () => setNewTitle(""));
  };

  const row = (step: Step) => (
    <li key={step.id} className="group flex flex-wrap items-center gap-2 rounded-md px-1 py-1 hover:bg-accent/50">
      <input
        id={`step_${step.id}`}
        type="checkbox"
        checked={Boolean(step.done_at)}
        disabled={readOnly || pending}
        onChange={(e) => run(() => setGoalStepDone(step.id, e.target.checked))}
        className="h-4 w-4 shrink-0 rounded border-input accent-primary"
      />
      {editing?.id === step.id ? (
        <>
          <input
            autoFocus
            aria-label="Step"
            value={editing.title}
            maxLength={200}
            disabled={pending}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveEdit();
              if (e.key === "Escape") setEditing(null);
            }}
            // With a phase picker beside it, leaving the box mustn't save
            // before the phase is chosen.
            onBlur={withPhases ? undefined : saveEdit}
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-primary sm:text-sm"
          />
          {withPhases && (
            <div className="flex w-full items-center gap-2 pl-6">
              <select
                aria-label="Phase"
                value={editing.phaseId}
                onChange={(e) => setEditing({ ...editing, phaseId: e.target.value })}
                className={cn(SELECT, "min-w-0 flex-1")}
              >
                <option value="">No phase</option>
                {phases!.map((p) => (
                  <option key={p.id} value={p.id}>
                    {phaseLabel(p)}
                  </option>
                ))}
              </select>
              <button type="button" onClick={saveEdit} disabled={pending} className="h-8 rounded-md border border-border px-3 text-sm font-medium hover:bg-accent">
                Save
              </button>
              <button type="button" onClick={() => setEditing(null)} className="text-sm text-muted-foreground hover:text-foreground">
                Cancel
              </button>
            </div>
          )}
        </>
      ) : (
        <label
          htmlFor={`step_${step.id}`}
          className={cn("min-w-0 flex-1 text-sm", step.done_at ? "text-muted-foreground line-through" : "text-foreground")}
        >
          {step.title}
        </label>
      )}
      {!readOnly && editing?.id !== step.id && (
        <button
          type="button"
          onClick={() => setEditing({ id: step.id, title: step.title, phaseId: step.phase_id ?? "" })}
          disabled={pending}
          aria-label={`Edit step: ${step.title}`}
          className="rounded p-1 text-muted-foreground opacity-60 hover:text-foreground group-hover:opacity-100"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      {!readOnly && editing?.id !== step.id && (
        <button
          type="button"
          onClick={() => run(() => deleteGoalStep(step.id))}
          disabled={pending}
          aria-label={`Remove step: ${step.title}`}
          className="rounded p-1 text-muted-foreground opacity-60 hover:text-foreground group-hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  );

  const groups = withPhases
    ? [
        ...phases!.map((p) => ({ phase: p as Phase | null, items: steps.filter((s) => s.phase_id === p.id) })),
        { phase: null, items: steps.filter((s) => !s.phase_id || !phases!.some((p) => p.id === s.phase_id)) },
      ].filter((g) => g.items.length > 0)
    : [{ phase: null, items: steps }];

  return (
    <div className="mt-4 space-y-3">
      {groups.map((g, i) =>
        g.items.length === 0 ? null : (
          <div key={g.phase?.id ?? `none${i}`} className="space-y-1">
            {withPhases && (
              <p className="flex items-baseline justify-between gap-2 px-1 text-xs font-medium text-muted-foreground">
                <span>{g.phase ? `${phaseLabel(g.phase)} · ${phaseWhen(g.phase)}` : "No phase"}</span>
                {g.phase && PHASE_CHIP[g.phase.status].label && (
                  <span className={PHASE_CHIP[g.phase.status].tone}>{PHASE_CHIP[g.phase.status].label}</span>
                )}
              </p>
            )}
            <ul className="space-y-1">{g.items.map(row)}</ul>
          </div>
        )
      )}

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`new_step_${goalId}`} className="sr-only">
            New step
          </label>
          <input
            id={`new_step_${goalId}`}
            value={newTitle}
            maxLength={200}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            placeholder={steps.length ? "Add another step" : "Add the first step"}
            className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary sm:text-sm"
          />
          {withPhases && (
            <select aria-label="Phase for the new step" value={newPhase} onChange={(e) => setNewPhase(e.target.value)} className={cn(SELECT, "h-9")}>
              <option value="">No phase</option>
              {phases!.map((p) => (
                <option key={p.id} value={p.id}>
                  Phase {p.position}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={add}
            disabled={pending || !newTitle.trim()}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      )}

      {error && (
        <p role="status" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
