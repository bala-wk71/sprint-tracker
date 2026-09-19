// Report periods: a week, a calendar month, quarter or year. Pure and client-safe.

import { format } from "date-fns";
import { addDaysIso, weekStartIsoOf, type WeekStartDay } from "@/lib/week";
import { quarterEndIso, quarterLabel, quarterOf, quarterStartIso } from "./quarters";

export type ReportPeriod = "week" | "month" | "quarter" | "year";

export const REPORT_PERIODS: ReportPeriod[] = ["week", "month", "quarter", "year"];

const pad = (n: number) => String(n).padStart(2, "0");

function monthEnd(start: string): string {
  const [y, m] = start.split("-").map(Number);
  return `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`;
}

/** The period containing `iso`. */
export function periodRange(period: ReportPeriod, iso: string, weekStartDay: WeekStartDay): { start: string; end: string } {
  switch (period) {
    case "week": {
      const start = weekStartIsoOf(iso, weekStartDay);
      return { start, end: addDaysIso(start, 6) };
    }
    case "month": {
      const start = `${iso.slice(0, 7)}-01`;
      return { start, end: monthEnd(start) };
    }
    case "quarter": {
      const q = quarterOf(iso);
      return { start: quarterStartIso(q), end: quarterEndIso(q) };
    }
    case "year":
      return { start: `${iso.slice(0, 4)}-01-01`, end: `${iso.slice(0, 4)}-12-31` };
  }
}

/** The period just before the one starting on `start`. */
export function previousPeriod(period: ReportPeriod, start: string, weekStartDay: WeekStartDay) {
  return periodRange(period, addDaysIso(start, -1), weekStartDay);
}

export function periodLabel(period: ReportPeriod, start: string): string {
  const d = new Date(`${start}T00:00:00`);
  switch (period) {
    case "week":
      return `Week of ${format(d, "d MMM yyyy")}`;
    case "month":
      return format(d, "MMMM yyyy");
    case "quarter":
      return quarterLabel(quarterOf(start));
    case "year":
      return start.slice(0, 4);
  }
}

/** Week starts inside [start, end]: the weeks a month or quarter is counted in. */
export function weekStartsIn(start: string, end: string, weekStartDay: WeekStartDay): string[] {
  const weeks: string[] = [];
  let w = weekStartIsoOf(start, weekStartDay);
  if (w < start) w = addDaysIso(w, 7);
  for (; w <= end; w = addDaysIso(w, 7)) weeks.push(w);
  return weeks;
}

/** Days of a review window around a quarter's end. */
const REVIEW_WINDOW_DAYS = 21;

/**
 * The written reports worth offering today: last month's once it's over, the
 * quarter in its last three weeks or the first three of the next, and the
 * year in December or January.
 */
export function reportsDue(todayIso: string, weekStartDay: WeekStartDay): { period: ReportPeriod; start: string; end: string }[] {
  const due: { period: ReportPeriod; start: string; end: string }[] = [];
  due.push({ period: "month", ...previousPeriod("month", periodRange("month", todayIso, weekStartDay).start, weekStartDay) });

  const quarter = periodRange("quarter", todayIso, weekStartDay);
  if (todayIso >= addDaysIso(quarter.end, -REVIEW_WINDOW_DAYS + 1)) due.push({ period: "quarter", ...quarter });
  else if (todayIso < addDaysIso(quarter.start, REVIEW_WINDOW_DAYS)) {
    due.push({ period: "quarter", ...previousPeriod("quarter", quarter.start, weekStartDay) });
  }

  const month = todayIso.slice(5, 7);
  if (month === "12") due.push({ period: "year", ...periodRange("year", todayIso, weekStartDay) });
  else if (month === "01") due.push({ period: "year", ...periodRange("year", addDaysIso(todayIso, -31), weekStartDay) });
  return due;
}
