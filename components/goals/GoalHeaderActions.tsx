"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { deleteGoal } from "@/app/(app)/goals/actions";

const BTN =
  "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium disabled:opacity-50";

/**
 * Edit and delete, at the top of the goal. On a phone the Manage card sits
 * below every other section, too far down to find.
 */
export function GoalHeaderActions({ goalId, childCount }: { goalId: string; childCount: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const remove = () => {
    const smaller = childCount > 0 ? ` Its ${childCount} smaller goal${childCount === 1 ? "" : "s"} stay, on their own.` : "";
    if (!window.confirm(`Delete this goal? Its check-ins stay in your journal.${smaller}`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteGoal(goalId);
      if (!result.ok) return setError(result.error);
      router.push("/goals");
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Link href={`/goals/${goalId}/edit`} className={`${BTN} text-foreground hover:bg-accent`}>
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Link>
        <button type="button" onClick={remove} disabled={pending} className={`${BTN} text-destructive hover:bg-destructive/10`}>
          <Trash2 className="h-3.5 w-3.5" />
          {pending ? "Deleting…" : "Delete"}
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
