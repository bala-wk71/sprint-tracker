import { addDaysIso } from "@/lib/week";

/**
 * How long after midnight yesterday's log stays open. A wrap-up written at
 * 00:30, or a focus session that started at 23:40, still belongs to the day it
 * describes — anything later is back-filling, which the daily log exists to
 * rule out.
 */
export const LATE_GRACE_HOURS = 3;

/**
 * Whether the log for `date` can still be written.
 *
 * Only the day you are living: today, plus yesterday during the grace hours
 * after midnight. Past days are a record, and future days haven't happened.
 */
export function isLogDayOpen(date: string, todayIso: string, localHour: number): boolean {
  if (date === todayIso) return true;
  return localHour < LATE_GRACE_HOURS && date === addDaysIso(todayIso, -1);
}

export const LOG_DAY_CLOSED =
  "That day is closed. Logs belong to the day they happen.";
