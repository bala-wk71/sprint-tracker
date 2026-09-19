// Where a measure is heading at its recent pace, and what that means for the
// next checkpoint: on pace, early, late but recoverable (the pace it needs is
// one you've managed before), or worth a replan. Pure and client-safe.

import { differenceInCalendarDays } from "date-fns";
import { addDaysIso } from "@/lib/week";
import type { Cadence, Checkpoint, Direction, Point } from "./projection";

const day = (iso: string) => new Date(`${iso}T00:00:00`);
const daysBetween = (from: string, to: string) => differenceInCalendarDays(day(to), day(from));

/** How far back the pace is read, per reading cadence: about 8 readings' worth, at least 8 weeks. */
export const TREND_WINDOW_DAYS: Record<Cadence, number> = { weekly: 56, monthly: 180, quarterly: 365 };
const MIN_POINTS = 3;
const MIN_SPAN_DAYS = 14;
/** Arriving this much before the checkpoint counts as early. */
const EARLY_DAYS = 21;
/** Past this, "at this pace you'd get there in 2041" isn't useful. */
const HORIZON_DAYS = 3650;

export type Trend = {
  /** Change per day on the fitted line (for compounding measures, at the latest point). */
  perDay: number;
  valueAt: (iso: string) => number;
  from: string;
  to: string;
  compound: boolean;
};

/**
 * Least-squares line through the points in [from, to]. Compounding measures
 * are fitted on the log so steady percentage growth reads as a straight line.
 */
export function fitTrend(points: Point[], fromIso: string, toIso: string, compound = false): Trend | null {
  const inWindow = points.filter((p) => p.date >= fromIso && p.date <= toIso).sort((a, b) => a.date.localeCompare(b.date));
  if (inWindow.length < MIN_POINTS) return null;
  const first = inWindow[0].date;
  const last = inWindow[inWindow.length - 1].date;
  if (daysBetween(first, last) < MIN_SPAN_DAYS) return null;
  const useLog = compound && inWindow.every((p) => p.value > 0);

  const xs = inWindow.map((p) => daysBetween(first, p.date));
  const ys = inWindow.map((p) => (useLog ? Math.log(p.value) : p.value));
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const valueAt = (iso: string) => {
    const y = intercept + slope * daysBetween(first, iso);
    return useLog ? Math.exp(y) : y;
  };
  const perDay = useLog ? valueAt(last) * slope : slope;
  return { perDay, valueAt, from: first, to: last, compound: useLog };
}

/** +1 when higher is better, -1 when lower is. */
const sign = (direction: Direction) => (direction === "down" ? -1 : 1);

/** The edge of a checkpoint's band that counts as reaching it. */
export function arrivalEdge(checkpoint: Pick<Checkpoint, "min" | "max">, direction: Direction): number | null {
  if (direction === "down") return checkpoint.max ?? checkpoint.min;
  if (direction === "up") return checkpoint.min ?? checkpoint.max;
  return null;
}

/**
 * The best pace ever held over one window, in the good direction (positive =
 * improving), from every window ending on a reading. Null without enough
 * history for even one window.
 */
export function bestPace(points: Point[], direction: Direction, windowDays: number, compound = false): number | null {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  let best: number | null = null;
  for (const end of sorted) {
    const trend = fitTrend(sorted, addDaysIso(end.date, -windowDays), end.date, compound);
    if (!trend) continue;
    const pace = trend.perDay * sign(direction);
    if (best === null || pace > best) best = pace;
  }
  return best;
}

export type ForecastVerdict = "there" | "early" | "on_pace" | "recoverable" | "replan";

export type Forecast = {
  verdict: ForecastVerdict;
  /** The checkpoint being aimed at, and the edge of it that counts. */
  target: { date: string; min: number | null; max: number | null; edge: number };
  /** Current pace, per day, in the measure's unit (signed: negative = falling). */
  perDay: number;
  /** Where the current pace lands on the checkpoint's date. */
  projected: number;
  /** When the current pace crosses the edge, if it does within ten years. */
  arrives: string | null;
  /** Pace needed from the latest reading to reach the edge on time, per day, in the good direction. */
  neededPerDay: number;
  /** Best pace held over a window so far, per day, in the good direction. */
  bestPerDay: number | null;
  /** For the chart: from the latest reading to the checkpoint's date along the current pace. */
  line: Point[];
};

/**
 * Forecast a number measure against its next checkpoint. Null when there's
 * no next checkpoint, too little recent data, or the measure isn't one a
 * pace means anything for (ranges, ladders, loan schedules).
 */
export function forecastMeasure(input: {
  points: Point[];
  direction: Direction;
  cadence: Cadence;
  compound: boolean;
  next: Checkpoint | null;
  todayIso: string;
}): Forecast | null {
  const { points, direction, next, todayIso } = input;
  if (!next || direction === "band") return null;
  const edge = arrivalEdge(next, direction);
  if (edge === null) return null;
  const latest = points.filter((p) => p.date <= todayIso).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  if (!latest) return null;
  const window = TREND_WINDOW_DAYS[input.cadence];
  const trend = fitTrend(points, addDaysIso(todayIso, -window), todayIso, input.compound);
  if (!trend) return null;

  const s = sign(direction);
  const reached = (value: number) => (value - edge) * s >= 0;
  const daysLeft = Math.max(7, daysBetween(latest.date, next.date));
  // Project from the latest reading, not the fitted line's end, so the dashed
  // line starts where the solid one stops.
  const offset = latest.value - trend.valueAt(latest.date);
  const along = (iso: string) => trend.valueAt(iso) + offset;
  const projected = along(next.date);

  let arrives: string | null = null;
  if (reached(latest.value)) arrives = latest.date;
  else if (trend.perDay * s > 0) {
    // Walk forward a week at a time; exact enough for a sentence, and works
    // for compounding lines too.
    for (let d = 7; d <= HORIZON_DAYS; d += 7) {
      const iso = addDaysIso(latest.date, d);
      if (reached(along(iso))) {
        arrives = iso;
        break;
      }
    }
  }

  const neededPerDay = ((edge - latest.value) * s) / daysLeft;
  const bestPerDay = bestPace(points, direction, window, input.compound);

  let verdict: ForecastVerdict;
  if (reached(latest.value)) verdict = "there";
  else if (reached(projected)) {
    verdict = arrives && daysBetween(arrives, next.date) >= EARLY_DAYS ? "early" : "on_pace";
  } else {
    // Late at this pace: fine if the pace it needs is one already managed.
    // A few weeks of data can't show what's realistic, so no replan until a
    // full window of history exists.
    const earliest = points.reduce((min, p) => (p.date < min ? p.date : min), latest.date);
    const enoughHistory = daysBetween(earliest, todayIso) >= window;
    verdict = !enoughHistory || bestPerDay === null || bestPerDay >= neededPerDay ? "recoverable" : "replan";
  }

  return {
    verdict,
    target: { date: next.date, min: next.min, max: next.max, edge },
    perDay: trend.perDay,
    projected,
    arrives,
    neededPerDay,
    bestPerDay,
    line: [
      { date: latest.date, value: latest.value },
      { date: next.date, value: projected },
    ],
  };
}
