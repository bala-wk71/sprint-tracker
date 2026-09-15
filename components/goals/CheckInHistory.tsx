import Link from "next/link";
import { format } from "date-fns";
import { Markdown } from "@/components/shared/Markdown";
import { formatValue } from "@/lib/goals/progress";

export type GoalEntry = {
  id: string;
  entry_date: string;
  title: string;
  body: string;
  kind: string;
  on_track: number | null;
  value: number | null;
};

/** Everything written about one goal, newest first: check-ins and closing notes. */
export function CheckInHistory({
  entries,
  unit,
  readOnly = false,
}: {
  entries: GoalEntry[];
  unit: string | null;
  /** Reviewers read the history; only the owner gets edit links. */
  readOnly?: boolean;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <h2 className="mb-3 text-lg font-semibold text-foreground">Check-ins and notes</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing yet. Your first check-in will show up here, and in your journal.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {entries.map((e) => (
            <li key={e.id} className="space-y-1.5 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium tabular-nums text-foreground">
                  {format(new Date(`${e.entry_date}T00:00:00`), "EEE d MMM yyyy")}
                </span>
                <span>{e.kind === "check_in" ? "Check-in" : "Note"}</span>
                {e.value !== null && (
                  <span className="rounded-full bg-muted px-2 py-0.5 tabular-nums text-foreground">
                    {formatValue(e.value, unit)}
                  </span>
                )}
                {e.on_track !== null && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium tabular-nums text-primary">
                    Feels {e.on_track}/10
                  </span>
                )}
                {!readOnly && (
                  <Link href={`/journal/${e.id}`} className="ml-auto hover:text-foreground">
                    Edit
                  </Link>
                )}
              </div>
              {e.kind !== "check_in" && e.title && (
                <p className="text-sm font-medium text-foreground">{e.title}</p>
              )}
              <div className="text-sm leading-relaxed text-foreground">
                <Markdown content={e.body} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
