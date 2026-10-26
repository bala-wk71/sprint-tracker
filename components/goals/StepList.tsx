"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { addGoalStep, deleteGoalStep, renameGoalStep, setGoalStepDone } from "@/app/(app)/goals/step-actions";
import { announceXp } from "@/lib/xpToast";

type Step = { id: string; title: string; done_at: string | null };

export function StepList({
  goalId,
  steps,
  readOnly,
}: {
  goalId: string;
  steps: Step[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [newTitle, setNewTitle] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);

  const saveRename = () => {
    if (!editing) return;
    const step = steps.find((s) => s.id === editing.id);
    if (!step || editing.title.trim() === step.title) return setEditing(null);
    run(() => renameGoalStep(editing.id, editing.title), () => setEditing(null));
  };

  const run = (action: () => Promise<{ ok: true; xp?: number } | { ok: false; error: string }>, after?: () => void) => {
    setError(null);
    setFlash(null);
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

  return (
    <div className="mt-4 space-y-3">
      {steps.length > 0 && (
        <ul className="space-y-1">
          {steps.map((step) => (
            <li key={step.id} className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-accent/50">
              <input
                id={`step_${step.id}`}
                type="checkbox"
                checked={Boolean(step.done_at)}
                disabled={readOnly || pending}
                onChange={(e) => run(() => setGoalStepDone(step.id, e.target.checked))}
                className="h-4 w-4 shrink-0 rounded border-input accent-primary"
              />
              {editing?.id === step.id ? (
                <input
                  autoFocus
                  aria-label="Step"
                  value={editing.title}
                  maxLength={200}
                  disabled={pending}
                  onChange={(e) => setEditing({ id: step.id, title: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveRename();
                    if (e.key === "Escape") setEditing(null);
                  }}
                  onBlur={saveRename}
                  className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-primary sm:text-sm"
                />
              ) : (
                <label
                  htmlFor={`step_${step.id}`}
                  className={cn(
                    "min-w-0 flex-1 text-sm",
                    step.done_at ? "text-muted-foreground line-through" : "text-foreground"
                  )}
                >
                  {step.title}
                </label>
              )}
              {!readOnly && editing?.id !== step.id && (
                <button
                  type="button"
                  onClick={() => setEditing({ id: step.id, title: step.title })}
                  disabled={pending}
                  aria-label={`Rename step: ${step.title}`}
                  className="rounded p-1 text-muted-foreground opacity-60 hover:text-foreground group-hover:opacity-100"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              {!readOnly && (
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
          ))}
        </ul>
      )}

      {!readOnly && (
        <div className="flex items-center gap-2">
          <label htmlFor={`new_step_${goalId}`} className="sr-only">
            New step
          </label>
          <input
            id={`new_step_${goalId}`}
            value={newTitle}
            maxLength={200}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTitle.trim()) {
                run(() => addGoalStep(goalId, newTitle), () => setNewTitle(""));
              }
            }}
            placeholder={steps.length ? "Add another step" : "Add the first step"}
            className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary sm:text-sm"
          />
          <button
            type="button"
            onClick={() => run(() => addGoalStep(goalId, newTitle), () => setNewTitle(""))}
            disabled={pending || !newTitle.trim()}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      )}

      {(error || flash) && (
        <p role="status" className={cn("text-xs", error ? "text-destructive" : "font-semibold text-primary")}>
          {error ?? flash}
        </p>
      )}
    </div>
  );
}
