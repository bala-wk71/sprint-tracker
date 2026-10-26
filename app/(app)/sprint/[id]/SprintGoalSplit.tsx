import Link from "next/link";
import { Target } from "lucide-react";
import type { GoalSplit } from "@/lib/planning/alignment";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * How the week lines up with the goals, added up from what each task says
 * it serves. Tasks for no goal (the job, sleep) are named, not judged.
 */
export function SprintGoalSplit({ split }: { split: GoalSplit }) {
  const total = split.goalHours + split.otherHours;
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Target className="h-4 w-4 text-primary" />
          Goals this week
        </h2>
        {total > 0 && (
          <span className="text-xs text-muted-foreground">
            {fmt(split.goalHours)}h of {fmt(total)}h planned serve a goal
          </span>
        )}
      </div>

      {split.byGoal.length > 0 ? (
        <ul className="space-y-1.5">
          {split.byGoal.map((g) => (
            <li key={g.goalId} className="flex items-center gap-3 text-sm">
              <Link href={`/goals/${g.goalId}`} className="min-w-0 flex-1 truncate text-foreground hover:text-primary">
                {g.title}
              </Link>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {fmt(g.hours)}h{g.tasks > 1 ? ` · ${g.tasks} tasks` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No task serves a goal this week. Edit a task below to say which one it serves.
        </p>
      )}

      {split.other.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Not for a goal: {split.other.map((o) => `${o.name} ${fmt(o.hours)}h`).join(" · ")}
        </p>
      )}
    </section>
  );
}
