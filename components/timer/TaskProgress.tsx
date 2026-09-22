import { formatHours } from "@/lib/utils";

export type TimerTaskProgress = {
  id: string;
  targetHours: number;
  weekHours: number;
  todayHours: number;
  /** Where the week's target says this task should be by the end of today. */
  expectedHours: number;
};

/** How the task picked in the timer is doing, today and against its week. */
export function TaskProgress({
  name,
  progress,
  pendingHours,
}: {
  name: string;
  progress: TimerTaskProgress;
  /** Finished sessions not yet saved, so the numbers move the moment one ends. */
  pendingHours: number;
}) {
  const today = progress.todayHours + pendingHours;
  const week = progress.weekHours + pendingHours;
  const gap = progress.expectedHours - week;

  return (
    <p className="text-xs text-muted-foreground" data-testid="task-progress">
      <span className="font-medium text-foreground">{name}</span>: {today.toFixed(1)}h today
      {progress.targetHours > 0 && (
        <>
          {" · "}
          {formatHours(Math.round(week * 10) / 10)} of {formatHours(progress.targetHours)}h this week
          {" · "}
          {gap > 0.5
            ? `${gap.toFixed(1)}h to catch up to this week's pace`
            : "on pace for the week"}
        </>
      )}
    </p>
  );
}
