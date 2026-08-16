/**
 * Which day a sprint week starts on.
 *
 * Sprints are keyed by `week_start_date`, and every screen that reads them
 * works out that date by snapping a day to the start of its week. That snap
 * used to be hard-coded to Monday, which stranded anyone running a Wednesday
 * -to-Tuesday week: the sprint existed, but the dashboard, the daily page and
 * the analytics all looked it up under the wrong Monday and found nothing.
 *
 * 0 = Sunday … 6 = Saturday, matching JS `Date#getDay()`.
 */
export type WeekStartDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DEFAULT_WEEK_START_DAY: WeekStartDay = 1;

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const WEEK_START_OPTIONS: { value: WeekStartDay; label: string }[] =
  WEEKDAY_NAMES.map((label, value) => ({
    value: value as WeekStartDay,
    label,
  }));

/** Coerce anything stored or posted into a valid day-of-week. */
export function toWeekStartDay(value: unknown): WeekStartDay {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 6
    ? (n as WeekStartDay)
    : DEFAULT_WEEK_START_DAY;
}

export function weekStartDayName(day: WeekStartDay): string {
  return WEEKDAY_NAMES[day];
}

/** Local-midnight parse, so a date never slides a day through UTC. */
function parseIso(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The start (YYYY-MM-DD) of the week containing `iso`. */
export function weekStartIsoOf(iso: string, weekStartDay: WeekStartDay): string {
  const date = parseIso(iso);
  const back = (date.getDay() - weekStartDay + 7) % 7;
  date.setDate(date.getDate() - back);
  return toIso(date);
}

/** `days` after `iso`, as YYYY-MM-DD. Negative values go backwards. */
export function addDaysIso(iso: string, days: number): string {
  const date = parseIso(iso);
  date.setDate(date.getDate() + days);
  return toIso(date);
}

/** The last day of the week that starts on `weekStart`. */
export function weekEndIsoOf(weekStart: string): string {
  return addDaysIso(weekStart, 6);
}

export function isWeekStart(iso: string, weekStartDay: WeekStartDay): boolean {
  return parseIso(iso).getDay() === weekStartDay;
}

/** The seven dates of the week beginning at `weekStart`, in order. */
export function weekDatesFrom(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i));
}
