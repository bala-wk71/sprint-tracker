import Link from "next/link";
import { ACTIVE_GOAL_SOFT_LIMIT } from "@/lib/goals/constants";
import type { GoalGlance } from "@/lib/goals/glance";

type Props = {
  goals: GoalGlance[];
  /** Every active goal, including the ones not shown. */
  total: number;
};

/**
 * A few goals, one line each, for the pages opened every day. Shows only the
 * top ones on purpose, and says so when the full list has grown too long.
 */
export function GoalsGlance({ goals, total }: Props) {
  const tooMany = total > ACTIVE_GOAL_SOFT_LIMIT;

  return (
    <section className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-foreground">Goals</h2>
          {total > goals.length && (
            <span className="text-xs text-muted-foreground">
              top {goals.length} of {total}
            </span>
          )}
        </div>
        <Link href="/goals" className="text-xs font-medium text-primary hover:underline">
          All goals
        </Link>
      </div>

      {goals.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing bigger than this week yet.{" "}
          <Link href="/goals/new" className="font-medium text-primary hover:underline">
            Add a goal
          </Link>
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {goals.map((goal) => (
            <li key={goal.id}>
              <Link
                href={goal.checkinDue ? `/goals/${goal.id}#check-in` : `/goals/${goal.id}`}
                className="flex items-center gap-2.5 py-2 text-sm"
              >
                <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${goal.dot}`} />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {goal.title}
                </span>
                {goal.checkinDue ? (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                    Check in
                  </span>
                ) : (
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {goal.label}
                  </span>
                )}
                <span className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-muted sm:w-20">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${Math.round((goal.progress ?? 0) * 100)}%` }}
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {tooMany && (
        <p className="mt-1 border-t border-border pt-2 text-xs text-muted-foreground">
          {total} active goals pull you in too many directions.{" "}
          <Link href="/goals" className="font-medium text-primary hover:underline">
            Pause a few
          </Link>{" "}
          so these get your attention.
        </p>
      )}
    </section>
  );
}
