"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { freeHours, type TimeBudget } from "@/lib/planning/focus";
import { FIELD_LABEL, INPUT } from "@/components/goals/GoalFormParts";
import { saveTimeBudget } from "@/app/(app)/goals/plan-actions";

/**
 * The week before any stream: 168 hours, less sleep, the job and the things
 * that happen anyway. The streams share what is left, and can't plan more.
 */
export function WeekBudget({ budget, plannedHours }: { budget: TimeBudget; plannedHours: number }) {
  const [editing, setEditing] = useState(false);
  const free = freeHours(budget);
  const spare = Math.round((free - plannedHours) * 10) / 10;
  const pct = free > 0 ? Math.min(100, (plannedHours / free) * 100) : 100;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{free}h a week for your streams</p>
          <p className="text-xs text-muted-foreground">
            168h, less {budget.sleepHours}h sleep a night, {budget.jobHours}h job and {budget.overheadHours}h of everyday life
          </p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Change your week"
            className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="space-y-1">
        <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className={cn("h-full rounded-full", spare >= 0 ? "bg-primary" : "bg-amber-500")} style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">
          {plannedHours}h planned · {spare >= 0 ? `${spare}h spare` : `${-spare}h over: lower a stream before adding to any`}
        </p>
      </div>
      {editing && <BudgetForm budget={budget} onDone={() => setEditing(false)} />}
    </div>
  );
}

function BudgetForm({ budget, onDone }: { budget: TimeBudget; onDone: () => void }) {
  const router = useRouter();
  const [sleep, setSleep] = useState(String(budget.sleepHours));
  const [job, setJob] = useState(String(budget.jobHours));
  const [overhead, setOverhead] = useState(String(budget.overheadHours));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveTimeBudget({ sleepHours: Number(sleep), jobHours: Number(job), overheadHours: Number(overhead) });
      if (!result.ok) return setError(result.error);
      onDone();
      router.refresh();
    });
  };

  const field = (id: string, label: string, value: string, set: (v: string) => void) => (
    <div>
      <label htmlFor={id} className={FIELD_LABEL}>{label}</label>
      <input id={id} inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} className={INPUT} />
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-3 border-t border-border pt-3">
      <div className="grid grid-cols-3 gap-2">
        {field("budget_sleep", "Sleep a night", sleep, setSleep)}
        {field("budget_job", "Job a week", job, setJob)}
        {field("budget_overhead", "Everyday a week", overhead, setOverhead)}
      </div>
      <p className="text-xs text-muted-foreground">Everyday covers commute, meals, chores: the hours that go whatever you plan.</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onDone} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
      </div>
    </form>
  );
}
