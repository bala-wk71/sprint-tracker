import Link from "next/link";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { getWeekStartDay } from "@/lib/dates";
import { addDaysIso, weekStartIsoOf } from "@/lib/week";
import { goalLevelLabel } from "@/lib/planning/constants";
import { expectedBand } from "@/lib/planning/projection";
import { formatBand } from "@/lib/planning/format";
import { nextQuarter, quarterEndIso, quarterLabel, quarterOf, quarterStartIso } from "@/lib/planning/quarters";
import { loadLeverSummaries, loadMeasureSummaries, planOwnerId } from "@/lib/planning/load";
import { MeasureCard } from "./MeasureCard";
import { LeverList } from "./LeverList";
import { AddMeasure, AddQuarterGoal } from "./PlanActions";

const CARD = "rounded-xl border border-border bg-card p-4 sm:p-6";
/** With less than this left in a quarter, planning it is too late; offer the next one. */
const MIN_QUARTER_DAYS_LEFT = 21;

type GoalLite = {
  id: string;
  parent_id: string | null;
  title: string;
  status: string;
  level: string | null;
  start_date: string;
  target_date: string;
};

/**
 * The plan behind a goal: its measures on their path, the weekly actions that
 * move them, and the quarter goals underneath. A quarter goal without its own
 * measures shows its parent's path for the quarter, so the week's work and
 * the big number sit on one page.
 */
export async function PlanSection({
  goal,
  allGoals,
  ownerId,
  todayIso,
  readOnly,
}: {
  goal: GoalLite;
  allGoals: GoalLite[];
  ownerId: string;
  todayIso: string;
  readOnly: boolean;
}) {
  const supabase = await createClient();
  const weekStart = weekStartIsoOf(todayIso, await getWeekStartDay());
  const byId = new Map(allGoals.map((g) => [g.id, g]));

  // Measures on this goal, plus on its ancestors in case this goal borrows their path.
  const ancestors: GoalLite[] = [];
  for (let cursor = goal.parent_id, depth = 0; cursor && depth < 10; depth++) {
    const g = byId.get(cursor);
    if (!g) break;
    ancestors.push(g);
    cursor = g.parent_id;
  }
  const [summaries, levers] = await Promise.all([
    loadMeasureSummaries(supabase, ownerId, [goal, ...ancestors], todayIso),
    loadLeverSummaries(supabase, ownerId, [goal.id], allGoals, todayIso, weekStart),
  ]);
  const own = summaries.get(goal.id) ?? [];
  const ownerOfPath = own.length ? goal.id : planOwnerId(goal.id, allGoals, (id) => (summaries.get(id)?.length ?? 0) > 0);
  const borrowed = ownerOfPath && ownerOfPath !== goal.id ? byId.get(ownerOfPath) ?? null : null;
  const borrowedSummaries = borrowed ? summaries.get(borrowed.id) ?? [] : [];

  const quarters = allGoals
    .filter((g) => g.parent_id === goal.id && g.level === "quarter")
    .sort((a, b) => a.target_date.localeCompare(b.target_date));
  const thisQuarterEnd = quarterEndIso(quarterOf(todayIso));
  const hasThisQuarter = quarters.some((q) => q.target_date === thisQuarterEnd || (q.start_date <= todayIso && q.target_date >= todayIso));
  const next = nextQuarter(quarterOf(todayIso));
  const hasNextQuarter = quarters.some((q) => q.target_date >= quarterStartIso(next) && q.target_date <= quarterEndIso(next));
  const canCascade = !readOnly && goal.level !== "quarter" && goal.level !== "project" && goal.target_date > thisQuarterEnd;
  const level = goalLevelLabel(goal.level);

  return (
    <section id="plan" className={`${CARD} scroll-mt-20 space-y-5`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">Plan</h2>
        {level && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{level}</span>}
      </div>

      {own.length === 0 && !borrowed && (
        <div className="space-y-3">
          <p className="max-w-prose text-sm text-muted-foreground">
            Give this goal a target and the path to it: where you are now, where you want to be, and the checkpoints
            in between. Weight and body numbers fill in from Health; anything else, like profit or a skill level, you log.
          </p>
          {!readOnly && <AddMeasure goalId={goal.id} todayIso={todayIso} prominent />}
        </div>
      )}

      {own.length > 0 && (
        <div className="space-y-3">
          {own.map((s) => (
            <MeasureCard key={s.measure.id} summary={s} goalId={goal.id} todayIso={todayIso} readOnly={readOnly} />
          ))}
          {!readOnly && <AddMeasure goalId={goal.id} todayIso={todayIso} />}
        </div>
      )}

      {borrowed && borrowedSummaries.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This quarter&apos;s share of{" "}
            <Link href={`/goals/${borrowed.id}#plan`} className="font-medium text-foreground hover:text-primary">
              {borrowed.title}
            </Link>
            :
          </p>
          <ul className="space-y-1.5 text-sm">
            {borrowedSummaries.map((s) => {
              const band = expectedBand(s.path, goal.target_date);
              return (
                <li key={s.measure.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2">
                  <span className="font-medium text-foreground">{s.measure.label}</span>
                  <span className="text-muted-foreground">
                    {band ? `${formatBand(band.min, band.max, s.measure.unit)} by ${format(new Date(`${goal.target_date}T00:00:00`), "d MMM")}` : "No path yet"}
                  </span>
                </li>
              );
            })}
          </ul>
          {!readOnly && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Track a separate number for this quarter</summary>
              <div className="pt-2">
                <AddMeasure goalId={goal.id} todayIso={todayIso} />
              </div>
            </details>
          )}
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Weekly actions</h3>
        <LeverList goalId={goal.id} levers={levers} readOnly={readOnly} />
      </div>

      {(quarters.length > 0 || canCascade) && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Quarters</h3>
          {quarters.length > 0 && (
            <ul className="space-y-1">
              {quarters.map((q) => (
                <li key={q.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/goals/${q.id}`} className="min-w-0 truncate text-foreground hover:text-primary">
                    {q.title}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {q.status === "done" ? "Done" : q.target_date < todayIso ? "Ended" : `Ends ${format(new Date(`${q.target_date}T00:00:00`), "d MMM")}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {canCascade && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                A quarter goal holds the 1–3 projects that move this one. Link the week&apos;s sprint tasks to it and the hours add up here.
              </p>
              <div className="flex flex-wrap gap-2">
                {!hasThisQuarter && addDaysIso(todayIso, MIN_QUARTER_DAYS_LEFT) <= thisQuarterEnd && (
                  <AddQuarterGoal goalId={goal.id} which="current" label={`Plan ${quarterLabel(quarterOf(todayIso))}`} />
                )}
                {!hasNextQuarter && quarterStartIso(next) <= goal.target_date && (
                  <AddQuarterGoal goalId={goal.id} which="next" label={`Plan ${quarterLabel(next)}`} />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
