import Link from "next/link";
import { format } from "date-fns";
import { CheckSquare, Square } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  hoursWeek: number;
  hoursMonth: number;
  hoursTotal: number;
  /** True when an active goal has had no logged work or check-in for three weeks. */
  quiet: boolean;
  tasks: { id: string; name: string; sprintId: string; weekStart: string | null }[];
  todos: { id: string; title: string; is_completed: boolean }[];
};

const hours = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}h`;

/** Where the week meets the long view: hours and work that point at this goal. */
export function LinkedWork({ hoursWeek, hoursMonth, hoursTotal, quiet, tasks, todos }: Props) {
  const stats = [
    { label: "This week", value: hoursWeek },
    { label: "This month", value: hoursMonth },
    { label: "All time", value: hoursTotal },
  ];
  const nothingLinked = tasks.length === 0 && todos.length === 0;

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <h2 className="mb-3 text-lg font-semibold text-foreground">Work toward this</h2>

      <dl className="grid grid-cols-3 gap-2 sm:gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg bg-muted/40 px-3 py-2">
            <dt className="text-xs text-muted-foreground">{s.label}</dt>
            <dd className="text-lg font-semibold tabular-nums text-foreground">{hours(s.value)}</dd>
          </div>
        ))}
      </dl>

      {quiet && (
        <p className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-foreground">
          Nothing toward this in three weeks. Link a sprint task or a todo, or
          check in with how it&apos;s really going.
        </p>
      )}

      {nothingLinked ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Nothing linked yet. When you add a sprint task or a todo, choose this
          goal under &ldquo;Helps a goal&rdquo; and its logged hours count here.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {tasks.length > 0 && (
            <div className="min-w-0">
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Sprint tasks
              </h3>
              <ul className="space-y-1">
                {tasks.slice(0, 8).map((t) => (
                  <li key={t.id} className="flex min-w-0 items-baseline gap-2 text-sm">
                    <Link
                      href={`/sprint/${t.sprintId}`}
                      className="min-w-0 flex-1 truncate text-foreground hover:text-primary"
                    >
                      {t.name}
                    </Link>
                    {t.weekStart && (
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        wk of {format(new Date(`${t.weekStart}T00:00:00`), "d MMM")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {todos.length > 0 && (
            <div className="min-w-0">
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Todos
              </h3>
              <ul className="space-y-1">
                {todos.slice(0, 8).map((t) => (
                  <li key={t.id} className="flex min-w-0 items-center gap-2 text-sm">
                    {t.is_completed ? (
                      <CheckSquare className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Done" />
                    ) : (
                      <Square className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Open" />
                    )}
                    <Link
                      href="/todo"
                      className={cn(
                        "min-w-0 flex-1 truncate hover:text-primary",
                        t.is_completed ? "text-muted-foreground line-through" : "text-foreground"
                      )}
                    >
                      {t.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
