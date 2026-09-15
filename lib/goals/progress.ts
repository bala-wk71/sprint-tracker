import { addDays, differenceInCalendarDays, differenceInCalendarMonths, format } from "date-fns";

export type GoalProgressInput = {
  track_type: string;
  start_value: number | null;
  target_value: number | null;
  current_value: number | null;
};

export type GoalScheduleInput = {
  status: string;
  start_date: string;
  target_date: string;
  checkin_every_days: number;
  last_checkin_on: string | null;
};

const day = (iso: string) => new Date(`${iso}T00:00:00`);
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * 0–1 progress, or null when there is nothing to measure yet. Number goals
 * work in either direction: 90 → 80 kg counts down just as 8 → 21 km counts up.
 */
export function goalProgress(
  goal: GoalProgressInput,
  extra: { stepsDone?: number; stepsTotal?: number; lastFeeling?: number | null } = {}
): number | null {
  if (goal.track_type === "steps") {
    return extra.stepsTotal ? clamp01((extra.stepsDone ?? 0) / extra.stepsTotal) : null;
  }
  if (goal.track_type === "number") {
    const { start_value: s, target_value: t } = goal;
    if (s === null || t === null || s === t) return null;
    const c = goal.current_value ?? s;
    return clamp01((Number(c) - Number(s)) / (Number(t) - Number(s)));
  }
  if (goal.track_type === "feeling") {
    return extra.lastFeeling ? clamp01(extra.lastFeeling / 10) : null;
  }
  return null;
}

export function nextCheckinOn(goal: GoalScheduleInput): string {
  const base = goal.last_checkin_on ?? goal.start_date;
  return format(addDays(day(base), goal.checkin_every_days), "yyyy-MM-dd");
}

export function isCheckinDue(goal: GoalScheduleInput, todayIso: string) {
  return goal.status === "active" && nextCheckinOn(goal) <= todayIso;
}

export function isPastEnd(goal: GoalScheduleInput, todayIso: string) {
  return (goal.status === "active" || goal.status === "paused") && goal.target_date < todayIso;
}

export function timeLeftLabel(targetIso: string, todayIso: string): string {
  const days = differenceInCalendarDays(day(targetIso), day(todayIso));
  if (days < 0) return days === -1 ? "Ended yesterday" : `Ended ${-days} days ago`;
  if (days === 0) return "Ends today";
  if (days < 14) return `${days} ${days === 1 ? "day" : "days"} left`;
  if (days < 90) return `${Math.round(days / 7)} weeks left`;
  const months = differenceInCalendarMonths(day(targetIso), day(todayIso));
  if (months < 24) return `${months} months left`;
  return `${Math.round(months / 12)} years left`;
}

export function nextCheckinLabel(goal: GoalScheduleInput, todayIso: string): string {
  const days = differenceInCalendarDays(day(nextCheckinOn(goal)), day(todayIso));
  if (days <= 0) return "Check-in due";
  if (days === 1) return "Next check-in tomorrow";
  if (days < 7) return `Next check-in ${format(day(nextCheckinOn(goal)), "EEE")}`;
  return `Next check-in ${format(day(nextCheckinOn(goal)), "d MMM")}`;
}

/** "12 of 21 km" — trims trailing zeros so 12.0 reads as 12. */
export function formatValue(n: number | null, unit: string | null) {
  if (n === null) return "—";
  const text = Number.isInteger(Number(n)) ? String(Number(n)) : Number(n).toFixed(1);
  return unit ? `${text} ${unit}` : text;
}
