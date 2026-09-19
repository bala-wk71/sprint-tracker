// Plan-vs-actual math for goal measures: where a number should be on any date
// (the path), how a reading compares to it, and how far the goal has come.
// Pure functions over ISO dates so every rule can be unit-tested.

import { differenceInCalendarDays } from "date-fns";

export type Direction = "down" | "up" | "band";
export type Interpolate = "linear" | "compound" | "step";

/** A point on the path. Either bound may be open: "under 94" has no min. */
export type Checkpoint = {
  date: string;
  min: number | null;
  max: number | null;
  /** min/max are changes from the baseline ("down 4–5 cm" is -5 / -4). */
  relative?: boolean;
  /** "Held steady": the band stays flat from `date` until this date. */
  holdUntil?: string | null;
  label?: string | null;
};

export type Band = { min: number | null; max: number | null };

export type Baseline = { date: string; value: number };

export type Path = {
  baseline: Baseline | null;
  checkpoints: Checkpoint[];
  interpolate: Interpolate;
};

export type Point = { date: string; value: number };

const day = (iso: string) => new Date(`${iso}T00:00:00`);
const daysBetween = (from: string, to: string) => differenceInCalendarDays(day(to), day(from));
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

type Node = { date: string; min: number | null; max: number | null; holdUntil: string | null };

/**
 * Relative checkpoints become absolute once there is a baseline. Without one
 * they can't be placed yet, so they're dropped and `needsBaseline` says why.
 */
export function resolveCheckpoints(
  checkpoints: Checkpoint[],
  baseline: Baseline | null
): { resolved: Checkpoint[]; needsBaseline: boolean } {
  let needsBaseline = false;
  const resolved: Checkpoint[] = [];
  for (const c of checkpoints) {
    if (!c.relative) {
      resolved.push(c);
      continue;
    }
    if (!baseline) {
      needsBaseline = true;
      continue;
    }
    resolved.push({
      ...c,
      relative: false,
      min: c.min === null ? null : baseline.value + c.min,
      max: c.max === null ? null : baseline.value + c.max,
    });
  }
  resolved.sort((a, b) => a.date.localeCompare(b.date));
  return { resolved, needsBaseline };
}

function nodesOf(path: Path): Node[] {
  const { resolved } = resolveCheckpoints(path.checkpoints, path.baseline);
  const nodes: Node[] = resolved.map((c) => ({
    date: c.date,
    min: c.min,
    max: c.max,
    holdUntil: c.holdUntil ?? null,
  }));
  if (path.baseline && (nodes.length === 0 || path.baseline.date < nodes[0].date)) {
    const v = path.baseline.value;
    nodes.unshift({ date: path.baseline.date, min: v, max: v, holdUntil: null });
  }
  return nodes;
}

function between(a: number, b: number, t: number, mode: Interpolate): number {
  if (mode === "step") return a;
  if (mode === "compound" && a > 0 && b > 0) return a * Math.pow(b / a, t);
  return a + (b - a) * t;
}

/**
 * The band a measure should sit in on `dateIso`, or null before the plan
 * starts. Each bound is interpolated on its own; a bound that is open at the
 * next checkpoint stays open.
 */
export function expectedBand(path: Path, dateIso: string): Band | null {
  const nodes = nodesOf(path);
  if (nodes.length === 0 || dateIso < nodes[0].date) return null;

  let i = 0;
  while (i + 1 < nodes.length && nodes[i + 1].date <= dateIso) i++;
  const prev = nodes[i];
  const next = nodes[i + 1];
  const flat = { min: prev.min, max: prev.max };

  // Past the last checkpoint the target is simply held.
  if (!next) return flat;
  const from = prev.holdUntil && prev.holdUntil > prev.date ? prev.holdUntil : prev.date;
  if (dateIso <= from || from >= next.date) return flat;

  const t = daysBetween(from, dateIso) / daysBetween(from, next.date);
  const bound = (key: "min" | "max"): number | null => {
    const target = next[key];
    if (target === null) return null;
    const other = key === "min" ? "max" : "min";
    const start = prev[key] ?? prev[other];
    return start === null ? target : between(start, target, t, path.interpolate);
  };
  return { min: bound("min"), max: bound("max") };
}

export type PathStatus = "ahead" | "on_track" | "catching_up" | "off_band";

/** Where a reading sits against the band, read in the measure's direction. */
export function statusOf(direction: Direction, band: Band, actual: number): PathStatus {
  const below = band.min !== null && actual < band.min;
  const above = band.max !== null && actual > band.max;
  if (direction === "down") return above ? "catching_up" : below ? "ahead" : "on_track";
  if (direction === "up") return below ? "catching_up" : above ? "ahead" : "on_track";
  return below || above ? "off_band" : "on_track";
}

/**
 * Distance from the band in the measure's direction: positive means ahead of
 * the path, negative means catching up, 0 inside it.
 */
export function leadOver(direction: Direction, band: Band, actual: number): number {
  if (band.max !== null && actual > band.max) return direction === "down" ? band.max - actual : actual - band.max;
  if (band.min !== null && actual < band.min) return direction === "down" ? band.min - actual : actual - band.min;
  return 0;
}

/** The edge of the final checkpoint that counts as "arrived". */
export function finishLine(path: Path, direction: Direction): number | null {
  const { resolved } = resolveCheckpoints(path.checkpoints, path.baseline);
  const last = resolved[resolved.length - 1];
  if (!last) return null;
  if (direction === "down") return last.max ?? last.min;
  if (direction === "up") return last.min ?? last.max;
  return null;
}

/** The best value reached so far: lowest for "down", highest for "up". */
export function bestValue(direction: Direction, points: Point[]): number | null {
  if (points.length === 0 || direction === "band") return null;
  const values = points.map((p) => p.value);
  return direction === "down" ? Math.min(...values) : Math.max(...values);
}

/**
 * Share of the way from baseline to the finish line, 0–1, using the best
 * value so a bad week never takes back distance already covered.
 */
export function distanceCovered(path: Path, direction: Direction, points: Point[]): number | null {
  if (!path.baseline || direction === "band") return null;
  const finish = finishLine(path, direction);
  const best = bestValue(direction, points);
  if (finish === null || best === null) return null;
  const total = finish - path.baseline.value;
  if (total === 0) return null;
  return clamp01((best - path.baseline.value) / total);
}

/** Latest point on or before a date. Points need not be sorted. */
export function latestOnOrBefore(points: Point[], dateIso: string): Point | null {
  let found: Point | null = null;
  for (const p of points) {
    if (p.date <= dateIso && (!found || p.date > found.date)) found = p;
  }
  return found;
}

/**
 * Each point replaced by the average of the points in the `windowDays` ending
 * on it, so one salty dinner doesn't swing a weight trend.
 */
export function trailingAverage(points: Point[], windowDays: number): Point[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((p, i) => {
    let sum = 0;
    let n = 0;
    for (let j = i; j >= 0 && daysBetween(sorted[j].date, p.date) < windowDays; j--) {
      sum += sorted[j].value;
      n++;
    }
    return { date: p.date, value: sum / n };
  });
}

/** Sampled path for a chart: every checkpoint plus evenly spaced points. */
export function pathSeries(
  path: Path,
  fromIso: string,
  toIso: string,
  samples = 24
): { date: string; min: number | null; max: number | null }[] {
  const span = daysBetween(fromIso, toIso);
  if (span <= 0) return [];
  const dates = new Set<string>([fromIso, toIso]);
  for (let k = 1; k < samples; k++) {
    const d = day(fromIso);
    d.setDate(d.getDate() + Math.round((span * k) / samples));
    dates.add(toIsoDate(d));
  }
  for (const c of path.checkpoints) if (c.date >= fromIso && c.date <= toIso) dates.add(c.date);
  if (path.baseline && path.baseline.date >= fromIso && path.baseline.date <= toIso) dates.add(path.baseline.date);
  return [...dates]
    .sort()
    .flatMap((date) => {
      const band = expectedBand(path, date);
      return band ? [{ date, ...band }] : [];
    });
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export type Cadence = "weekly" | "monthly" | "quarterly";

export const CADENCE_DAYS: Record<Cadence, number> = { weekly: 7, monthly: 30, quarterly: 91 };

/** A manual measure asks for a reading once its cadence has passed. */
export function readingDue(cadence: Cadence, lastReadingIso: string | null, todayIso: string): boolean {
  if (!lastReadingIso) return true;
  return daysBetween(lastReadingIso, todayIso) >= CADENCE_DAYS[cadence];
}

/**
 * Outstanding balance of a loan paid in equal EMIs, the last one due on
 * `lastEmiIso`. EMIs fall on that day of each month; one due today is
 * counted as paid.
 */
export function loanBalance(emi: number, lastEmiIso: string, dateIso: string): number {
  const [ly, lm, ld] = lastEmiIso.split("-").map(Number);
  const [y, m, d] = dateIso.split("-").map(Number);
  const months = ly * 12 + lm - (y * 12 + m) + (d < ld ? 1 : 0);
  return Math.max(0, months) * emi;
}
