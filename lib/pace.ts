// Pace math for plan-vs-execution: how many hours a task "should" have by
// a given day of the week, assuming targets spread evenly across 7 days.

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Days of the week considered elapsed as of `todayIso`, counting today as a
 * full day. 0 for future weeks, 7 for past weeks.
 */
export function elapsedDaysInWeek(weekStart: string, todayIso: string): number {
  if (todayIso < weekStart) return 0;
  if (todayIso > addDaysIso(weekStart, 6)) return 7;
  const diff = Math.round(
    (Date.parse(todayIso) - Date.parse(weekStart)) / 86_400_000
  );
  return diff + 1;
}

/** Hours a target "should" be at after `elapsedDays` of 7. */
export function expectedByNow(targetHours: number, elapsedDays: number): number {
  return (targetHours * elapsedDays) / 7;
}

export type PaceStatus = "ahead" | "on_pace" | "behind";

/** Half an hour of slack before something counts as off pace. */
const PACE_TOLERANCE_HOURS = 0.5;

export function paceStatus(
  targetHours: number,
  actualHours: number,
  elapsedDays: number
): { status: PaceStatus; deltaHours: number } {
  const delta = actualHours - expectedByNow(targetHours, elapsedDays);
  if (delta < -PACE_TOLERANCE_HOURS) return { status: "behind", deltaHours: delta };
  if (delta > PACE_TOLERANCE_HOURS) return { status: "ahead", deltaHours: delta };
  return { status: "on_pace", deltaHours: delta };
}
