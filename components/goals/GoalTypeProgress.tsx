import Link from "next/link";
import { format } from "date-fns";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { weekStartIsoOf, type WeekStartDay } from "@/lib/week";
import { goalTypeLabel } from "@/lib/goals/constants";
import { loadLeverSummaries, loadMeasureSummaries, type GoalNode } from "@/lib/planning/load";
import { loadTypedProgress } from "@/lib/goals/typed";
import type { Phase } from "@/lib/planning/phases";
import { GoalProgressBar } from "./GoalProgressBar";
import { StepList } from "./StepList";
import { MeasureCard } from "./plan/MeasureCard";
import { AddMeasure } from "./plan/PlanActions";
import { LeverRow } from "./plan/LeverList";

const CARD = "rounded-xl border border-border bg-card p-4 sm:p-6";

type Goal = {
  id: string;
  parent_id: string | null;
  track_type: string;
  level: string | null;
  start_date: string;
  target_date: string;
};

/**
 * A goal's progress, read the way its type reads it: a Target's number on
 * its path, a Habit's weeks, or Milestones ticked. A long-range goal also
 * keeps its phase-by-phase plan here, whatever its type.
 */
export async function GoalTypeProgress({
  goal,
  steps,
  feelings,
  phases,
  allGoals,
  ownerId,
  todayIso,
  weekStartDay,
  readOnly,
}: {
  goal: Goal;
  steps: { id: string; title: string; done_at: string | null; phase_id: string | null }[];
  feelings: number[];
  phases: Phase[];
  allGoals: GoalNode[];
  ownerId: string;
  todayIso: string;
  weekStartDay: WeekStartDay;
  readOnly: boolean;
}) {
  const supabase = await createClient();
  const type = goal.track_type;
  const longRange = goal.level === "destination";
  const weekStart = weekStartIsoOf(todayIso, weekStartDay);

  // Both load whatever the type, so a goal made before the types keeps
  // showing the numbers and weekly actions it already had.
  const [summaries, levers, typed] = await Promise.all([
    loadMeasureSummaries(supabase, ownerId, [goal], todayIso),
    loadLeverSummaries(supabase, ownerId, [goal.id], allGoals, todayIso, weekStart),
    type === "habit" ? loadTypedProgress(supabase, ownerId, [goal], todayIso, weekStartDay, { allGoals }) : Promise.resolve(null),
  ]);
  const own = summaries.get(goal.id) ?? [];
  const habit = typed?.get(goal.id);
  const extraMeasures = type === "number" ? [] : own;
  const extraLevers = type === "habit" ? levers.slice(1) : levers;
  const stepsDone = steps.filter((s) => s.done_at).length;

  const stepList = (
    <StepList
      goalId={goal.id}
      steps={steps}
      readOnly={readOnly}
      // A long-range goal's steps are planned phase by phase.
      phases={longRange ? phases : undefined}
    />
  );

  return (
    <>
      <section id="progress" className={cn(CARD, "scroll-mt-20 space-y-3")}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-foreground">Progress</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{goalTypeLabel(type)}</span>
        </div>

        {type === "number" &&
          (own.length > 0 ? (
            <div className="space-y-3">
              {own.map((s) => (
                <MeasureCard key={s.measure.id} summary={s} goalId={goal.id} todayIso={todayIso} readOnly={readOnly} />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">This Target has no number yet. Say which one, where it is and where it should get to.</p>
              {!readOnly && <AddMeasure goalId={goal.id} todayIso={todayIso} prominent />}
            </div>
          ))}

        {type === "habit" &&
          (levers.length > 0 ? (
            <div className="space-y-3">
              <ul>
                <LeverRow lever={levers[0]} readOnly={readOnly} />
              </ul>
              {habit?.kind === "habit" && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    {habit.habit.kept} of {habit.habit.total} weeks kept
                    {habit.habit.streak > 1 ? ` · ${habit.habit.streak} in a row` : ""}
                  </p>
                  <ol className="flex flex-wrap gap-1">
                    {habit.habit.weeks.map((w) => (
                      <li
                        key={w.start}
                        title={`Week of ${format(new Date(`${w.start}T00:00:00`), "d MMM")}: ${w.done}`}
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded text-[10px] tabular-nums",
                          w.kept
                            ? w.hit
                              ? "bg-progress-good text-white"
                              : "bg-primary text-primary-foreground"
                            : w.current
                              ? "border border-primary/50 text-foreground"
                              : "bg-muted text-muted-foreground"
                        )}
                      >
                        {w.done}
                      </li>
                    ))}
                  </ol>
                  <p className="text-xs text-muted-foreground">
                    Each square is a week. Filled means kept; green means the full target.
                  </p>
                </div>
              )}
              {!readOnly && (
                <Link href={`/goals/${goal.id}/edit`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  <Pencil className="h-3.5 w-3.5" />
                  Change what counts or how many
                </Link>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              This Habit has nothing counting it yet.{" "}
              {!readOnly && (
                <Link href={`/goals/${goal.id}/edit`} className="font-medium text-primary hover:underline">
                  Say what counts
                </Link>
              )}
            </p>
          ))}

        {type === "steps" && (
          <>
            <GoalProgressBar
              trackType="steps"
              startValue={null}
              targetValue={null}
              currentValue={null}
              unit={null}
              stepsDone={stepsDone}
              stepsTotal={steps.length}
              feelings={[]}
            />
            {stepList}
          </>
        )}

        {type === "feeling" && (
          <GoalProgressBar
            trackType="feeling"
            startValue={null}
            targetValue={null}
            currentValue={null}
            unit={null}
            stepsDone={0}
            stepsTotal={0}
            feelings={feelings}
          />
        )}
        {(extraMeasures.length > 0 || extraLevers.length > 0) && (
          <div className="space-y-3 border-t border-border pt-3">
            <h3 className="text-sm font-semibold text-foreground">Also tracked</h3>
            {extraMeasures.map((s) => (
              <MeasureCard key={s.measure.id} summary={s} goalId={goal.id} todayIso={todayIso} readOnly={readOnly} />
            ))}
            {extraLevers.length > 0 && (
              <ul className="divide-y divide-border">
                {extraLevers.map((l) => (
                  <LeverRow key={l.id} lever={l} readOnly={readOnly} />
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {longRange && type !== "steps" && (
        <section className={cn(CARD, "space-y-2")}>
          <h2 className="text-lg font-semibold text-foreground">Plan by phase</h2>
          <p className="text-sm text-muted-foreground">
            What each phase does towards this. When a phase starts, its steps here become that phase&apos;s goals.
          </p>
          {stepList}
        </section>
      )}
    </>
  );
}
