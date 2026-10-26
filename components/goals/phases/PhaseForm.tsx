"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { FIELD_LABEL, INPUT } from "@/components/goals/GoalFormParts";
import type { Phase } from "@/lib/planning/phases";
import { deletePhase, savePhase } from "@/app/(app)/goals/phase-actions";

/** Name and dates of a phase: a new one at the end of the plan, or an edit. */
export function PhaseForm({
  phase,
  defaults,
  onDone,
}: {
  phase?: Phase;
  defaults?: { startsOn: string; endsOn: string };
  onDone?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(phase?.name ?? "");
  const [startsOn, setStartsOn] = useState(phase?.startsOn ?? defaults?.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(phase?.endsOn ?? defaults?.endsOn ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await savePhase({ id: phase?.id, name, startsOn, endsOn });
      if (!result.ok) return setError(result.error);
      if (!phase) setName("");
      onDone?.();
      router.refresh();
    });
  };

  const remove = () => {
    if (!phase || !window.confirm(`Remove ${phase.name}? Steps planned for it stay on their goals, without a phase.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deletePhase(phase.id);
      if (!result.ok) return setError(result.error);
      onDone?.();
      router.refresh();
    });
  };

  const id = phase?.id ?? "new";
  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label htmlFor={`phase_name_${id}`} className={FIELD_LABEL}>Name</label>
        <input
          id={`phase_name_${id}`}
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          placeholder="Foundations, The Move…"
          className={INPUT}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={`phase_start_${id}`} className={FIELD_LABEL}>Starts</label>
          <input id={`phase_start_${id}`} type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className={INPUT} />
        </div>
        <div>
          <label htmlFor={`phase_end_${id}`} className={FIELD_LABEL}>Ends</label>
          <input id={`phase_end_${id}`} type="date" value={endsOn} min={startsOn} onChange={(e) => setEndsOn(e.target.value)} className={INPUT} />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "Saving…" : phase ? "Save" : "Add phase"}
        </button>
        {onDone && (
          <button type="button" onClick={onDone} className="text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </button>
        )}
        {phase?.status === "upcoming" && (
          <button type="button" onClick={remove} disabled={pending} className="ml-auto inline-flex items-center gap-1 text-sm text-destructive hover:underline">
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </button>
        )}
      </div>
    </form>
  );
}

/** A pencil that opens the phase's form over the page. */
export function PhaseEditButton({ phase }: { phase: Phase }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Edit ${phase.name}`}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      {open && (
        // A sheet from the bottom on a phone, a small dialog on wider screens.
        <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-label={`Edit ${phase.name}`}
            onClick={(e) => e.stopPropagation()}
            className="fixed inset-x-0 bottom-0 rounded-t-xl border border-border bg-card p-4 pb-8 shadow-lg sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-24 sm:w-96 sm:-translate-x-1/2 sm:rounded-xl sm:pb-4"
          >
            <PhaseForm phase={phase} onDone={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
