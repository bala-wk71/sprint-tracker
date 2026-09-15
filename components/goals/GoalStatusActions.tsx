"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, Pause, Pencil, Pin, PinOff, Play, RotateCcw, Trash2, Wind } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  changeGoalEndDate,
  deleteGoal,
  setGoalPinned,
  setGoalStatus,
  type GoalResult,
} from "@/app/(app)/goals/actions";

type Props = {
  goal: { id: string; status: string; pinned: boolean; startDate: string; targetDate: string };
  pastEnd: boolean;
};

const ACTION =
  "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors disabled:opacity-50";

export function GoalStatusActions({ goal, pastEnd }: Props) {
  const router = useRouter();
  const [closing, setClosing] = useState<"done" | "let_go" | null>(null);
  const [note, setNote] = useState("");
  const [editingDate, setEditingDate] = useState(pastEnd);
  const [endDate, setEndDate] = useState(goal.targetDate);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const open = goal.status === "active" || goal.status === "paused";

  const run = (action: () => Promise<GoalResult>, after?: (xp: number) => void) => {
    setError(null);
    setFlash(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      after?.(result.xp ?? 0);
      router.refresh();
    });
  };

  const confirmClose = () =>
    run(
      () => setGoalStatus({ id: goal.id, status: closing ?? "done", note }),
      (xp) => {
        setFlash(closing === "done" ? `Done. Well played${xp ? ` · +${xp} XP` : ""}` : "Let go. That's a real choice too.");
        setClosing(null);
        setNote("");
      }
    );

  const remove = () => {
    if (!window.confirm("Delete this goal? Its check-ins stay in your journal.")) return;
    startTransition(async () => {
      const result = await deleteGoal(goal.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/goals");
      router.refresh();
    });
  };

  return (
    <div className="space-y-1">
      {closing ? (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <label htmlFor={`closing_note_${goal.id}`} className="block text-sm font-medium text-foreground">
            {closing === "done" ? "What did it take?" : "What changed?"}
          </label>
          <textarea
            id={`closing_note_${goal.id}`}
            value={note}
            rows={3}
            maxLength={5000}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-primary sm:text-sm"
          />
          <p className="text-xs text-muted-foreground">Optional. Saved to your journal with this goal.</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={confirmClose}
              disabled={pending}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {closing === "done" ? "Mark as done" : "Let it go"}
            </button>
            <button type="button" onClick={() => setClosing(null)} className="text-sm text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          </div>
        </div>
      ) : open ? (
        <>
          <button type="button" onClick={() => setClosing("done")} disabled={pending} className={cn(ACTION, "text-foreground hover:bg-accent")}>
            <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            Mark as done
          </button>
          <button type="button" onClick={() => setClosing("let_go")} disabled={pending} className={cn(ACTION, "text-foreground hover:bg-accent")}>
            <Wind className="h-4 w-4 text-muted-foreground" />
            Let it go
          </button>
          <button
            type="button"
            onClick={() => run(() => setGoalStatus({ id: goal.id, status: goal.status === "paused" ? "active" : "paused", note: "" }))}
            disabled={pending}
            className={cn(ACTION, "text-foreground hover:bg-accent")}
          >
            {goal.status === "paused" ? <Play className="h-4 w-4 text-muted-foreground" /> : <Pause className="h-4 w-4 text-muted-foreground" />}
            {goal.status === "paused" ? "Resume" : "Pause"}
          </button>
          <button type="button" onClick={() => setEditingDate((v) => !v)} disabled={pending} className={cn(ACTION, "text-foreground hover:bg-accent")}>
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            {pastEnd ? "Extend the end date" : "Change end date"}
          </button>
          {editingDate && (
            <div className="flex items-center gap-2 px-2.5 pb-2">
              <label htmlFor={`end_date_${goal.id}`} className="sr-only">
                New end date
              </label>
              <input
                id={`end_date_${goal.id}`}
                type="date"
                min={goal.startDate}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-base text-foreground sm:text-sm"
              />
              <button
                type="button"
                onClick={() => run(() => changeGoalEndDate(goal.id, endDate), () => setEditingDate(false))}
                disabled={pending}
                className="h-9 shrink-0 rounded-md border border-border px-3 text-sm font-medium hover:bg-accent disabled:opacity-50"
              >
                Save
              </button>
            </div>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={() => run(() => setGoalStatus({ id: goal.id, status: "active", note: "" }))}
          disabled={pending}
          className={cn(ACTION, "text-foreground hover:bg-accent")}
        >
          <RotateCcw className="h-4 w-4 text-muted-foreground" />
          Reopen
        </button>
      )}

      <div className="my-1 h-px bg-border" />

      <button type="button" onClick={() => run(() => setGoalPinned(goal.id, !goal.pinned))} disabled={pending} className={cn(ACTION, "text-foreground hover:bg-accent")}>
        {goal.pinned ? <PinOff className="h-4 w-4 text-muted-foreground" /> : <Pin className="h-4 w-4 text-muted-foreground" />}
        {goal.pinned ? "Unpin from dashboard" : "Pin to dashboard"}
      </button>
      <Link href={`/goals/${goal.id}/edit`} className={cn(ACTION, "text-foreground hover:bg-accent")}>
        <Pencil className="h-4 w-4 text-muted-foreground" />
        Edit goal
      </Link>
      <button type="button" onClick={remove} disabled={pending} className={cn(ACTION, "text-destructive hover:bg-destructive/10")}>
        <Trash2 className="h-4 w-4" />
        Delete goal
      </button>

      {(error || flash) && (
        <p role="status" className={cn("px-2.5 pt-1 text-xs", error ? "text-destructive" : "font-semibold text-primary")}>
          {error ?? flash}
        </p>
      )}
    </div>
  );
}
