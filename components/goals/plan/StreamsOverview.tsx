import Link from "next/link";
import { cn } from "@/lib/utils";
import { goalArea } from "@/lib/goals/constants";
import { STATUS_COPY, type SummaryStatus } from "@/lib/planning/constants";
import type { StreamOverview } from "@/lib/planning/streams";

const ORDER: SummaryStatus[] = ["ahead", "on_track", "catching_up", "off_band", "needs_reading", "no_plan"];

export function HoursBar({ done, planned }: { done: number; planned: number | null }) {
  if (!planned) {
    return <p className="text-xs text-muted-foreground">{done > 0 ? `${done}h logged this week` : "No hours logged this week"}</p>;
  }
  const pct = Math.min(100, (done / planned) * 100);
  return (
    <div className="space-y-1">
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className={cn("h-full rounded-full", done >= planned ? "bg-progress-good" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {done}h of {planned}h this week
      </p>
    </div>
  );
}

/** One card per stream: what's moving, how the week's hours went, what needs a reading. */
export function StreamsOverview({ streams }: { streams: StreamOverview[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {streams.map((s) => {
        const area = goalArea(s.area);
        const chips = ORDER.filter((k) => s.counts[k]);
        return (
          <li key={s.id}>
            <Link
              href={`/goals/streams/${s.id}`}
              className="block h-full space-y-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 font-medium text-foreground">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", area.dot)} aria-hidden />
                  <span className="truncate">{s.name}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {s.goals.length} {s.goals.length === 1 ? "goal" : "goals"}
                </span>
              </div>
              {chips.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {chips.map((k) => (
                    <span key={k} className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_COPY[k].tone)}>
                      {s.counts[k]} {STATUS_COPY[k].label.toLowerCase()}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{s.goals.length ? "No targets set yet" : "No goals yet"}</p>
              )}
              <HoursBar done={s.hoursWeek} planned={s.weeklyHours} />
              {s.readingsDue > 0 && (
                <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                  {s.readingsDue} {s.readingsDue === 1 ? "reading" : "readings"} due
                </p>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
