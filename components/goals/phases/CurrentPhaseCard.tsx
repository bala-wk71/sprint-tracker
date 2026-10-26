import type { ReactNode } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowRight, Flag } from "lucide-react";
import { timeLeftLabel } from "@/lib/goals/progress";
import { nextPhaseOf, phaseWhen, type Phase } from "@/lib/planning/phases";
import { PhaseStrip } from "./PhaseStrip";

/**
 * The phase being worked on, at the top of Goals: where it sits in the plan,
 * how long is left, and its goals. Everything else waits below.
 */
export function CurrentPhaseCard({
  phases,
  current,
  todayIso,
  goalCount,
  children,
}: {
  phases: Phase[];
  current: Phase | null;
  todayIso: string;
  goalCount: number;
  children: ReactNode;
}) {
  const next = nextPhaseOf(phases);
  const ended = current !== null && current.endsOn < todayIso;

  return (
    <section className="space-y-3 rounded-xl border border-primary/30 bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-primary">
            <Flag className="h-3.5 w-3.5" />
            {current ? `Phase ${current.position} of ${phases.length}` : "Between phases"}
          </p>
          <h2 className="mt-0.5 text-lg font-semibold text-foreground">
            {current ? current.name : next ? `Next: ${next.name}` : "All phases done"}
          </h2>
          {current && (
            <p className="text-xs text-muted-foreground">
              {phaseWhen(current)}
              {!ended && ` · ${timeLeftLabel(current.endsOn, todayIso)}`}
            </p>
          )}
        </div>
        <Link href="/goals/phases" className="shrink-0 text-xs font-medium text-primary hover:underline">
          All phases
        </Link>
      </div>

      <PhaseStrip phases={phases} />

      {(ended || !current) && next && (
        <Link
          href="/goals/phases"
          className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-foreground hover:bg-amber-500/15"
        >
          <span>
            {current ? `This phase ended. Close its goals, then start ${next.name}.` : `Start ${next.name} when you're ready.`}
          </span>
          <ArrowRight className="h-4 w-4 shrink-0" />
        </Link>
      )}

      {goalCount > 0
        ? children
        : current && (
            <p className="text-sm text-muted-foreground">
              No goals in this phase yet. New goals that end by {format(new Date(`${current.endsOn}T00:00:00`), "d MMM yyyy")} join it.
            </p>
          )}
    </section>
  );
}
