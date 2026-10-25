"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { LeverRow } from "@/components/goals/plan/LeverList";
import type { LeverSummary } from "@/lib/planning/load";
import { announceXp } from "@/lib/xpToast";
import { setGoalStatus } from "@/app/(app)/goals/actions";
import { extendGoalOnce } from "./actions";
import type { EndedGoal } from "./load";

const BTN =
  "rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:border-primary/50 disabled:opacity-50";

const dayLabel = (iso: string) => format(new Date(`${iso}T00:00:00`), "d MMM");

/** A goal that ran past its end date asks once: done, one more stretch, or let go. */
function EndedGoalRow({ goal }: { goal: EndedGoal }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const close = (status: "done" | "let_go") =>
    startTransition(async () => {
      setError(null);
      const result = await setGoalStatus({ id: goal.id, status, note: "" });
      if (!result.ok) return setError(result.error);
      announceXp(result.xp, "Goal done");
      router.refresh();
    });

  const extend = () =>
    startTransition(async () => {
      setError(null);
      const result = await extendGoalOnce(goal.id);
      if (!result.ok) return setError(result.error);
      router.refresh();
    });

  return (
    <li className="space-y-1.5 py-2.5">
      <div className="min-w-0">
        <Link href={`/goals/${goal.id}`} className="block truncate text-sm font-medium text-foreground hover:underline">
          {goal.title}
        </Link>
        <p className="text-xs text-muted-foreground">Ended {dayLabel(goal.targetDate)}. How did it go?</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => close("done")} disabled={pending} className={BTN}>
          Done
        </button>
        {goal.canExtend && (
          <button type="button" onClick={extend} disabled={pending} className={BTN}>
            Give it a bit longer
          </button>
        )}
        <button type="button" onClick={() => close("let_go")} disabled={pending} className={BTN}>
          Let it go
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </li>
  );
}

export function GoalsCheck({
  levers,
  endedGoals,
}: {
  levers: (LeverSummary & { goalTitle: string })[];
  endedGoals: EndedGoal[];
}) {
  // What still needs doing first; finished ones sink but stay visible.
  const ordered = [...levers].sort((a, b) => Number(a.done >= a.target) - Number(b.done >= b.target));
  return (
    <div className="space-y-4">
      {ordered.length > 0 && (
        <div>
          <p className="text-sm font-medium text-foreground">This week&apos;s actions</p>
          <p className="text-xs text-muted-foreground">Most count themselves from what you log above. Tap the rest.</p>
          <ul className="divide-y divide-border">
            {ordered.map((l) => (
              <LeverRow key={l.id} lever={l} goalTitle={l.goalTitle} />
            ))}
          </ul>
        </div>
      )}
      {endedGoals.length > 0 && (
        <div>
          <p className="text-sm font-medium text-foreground">Goals that reached their end date</p>
          <ul className="divide-y divide-border">
            {endedGoals.map((g) => (
              <EndedGoalRow key={g.id} goal={g} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
