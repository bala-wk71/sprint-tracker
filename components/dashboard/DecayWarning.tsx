import { AlertTriangle, TrendingDown } from "lucide-react";
import {
  XP_DECAY_GRACE_DAYS,
  XP_DECAY_RATE,
  untrackedRun,
} from "@/lib/gamification";

/**
 * Tells someone the bleed is coming before it takes anything.
 *
 * XP decay is only fair if it is predictable, so the warning appears during
 * the grace days — while there is still nothing to lose and something to do
 * about it — and changes tone once it has started costing. Silent on a day
 * that has been tracked.
 */
export function DecayWarning({
  trackedDates,
  todayIso,
}: {
  trackedDates: string[];
  todayIso: string;
}) {
  const days = untrackedRun(trackedDates, todayIso);
  if (days === 0) return null;

  const bleeding = days > XP_DECAY_GRACE_DAYS;
  const pct = Math.round(XP_DECAY_RATE * 100);
  const lastTracked = [...trackedDates].sort().at(-1);

  return (
    <div
      className={
        bleeding
          ? "flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3"
          : "flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3"
      }
    >
      {bleeding ? (
        <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">
          {bleeding
            ? `Losing ${pct}% of your XP a day`
            : days === XP_DECAY_GRACE_DAYS
              ? "XP starts bleeding tomorrow"
              : `${days} ${days === 1 ? "day" : "days"} untracked`}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {lastTracked ? `Nothing recorded since ${lastTracked}. ` : ""}
          {bleeding
            ? "Log a check-in, a journal entry, a workout or a weigh-in to stop it."
            : `Anything counts — a check-in, a journal entry, a workout, a weigh-in or a meal. ${
                XP_DECAY_GRACE_DAYS - days + 1
              } ${
                XP_DECAY_GRACE_DAYS - days + 1 === 1 ? "day" : "days"
              } of grace left.`}
        </p>
      </div>
    </div>
  );
}
