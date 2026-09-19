// One measure, summarised for the screen: the path, where it stands today,
// how far it has come, and whether a reading is due. Pure and client-safe.

import {
  bestValue,
  distanceCovered,
  expectedBand,
  leadOver,
  loanBalance,
  resolveCheckpoints,
  readingDue,
  statusOf,
  type Band,
  type Baseline,
  type Cadence,
  type Checkpoint,
  type Direction,
  type Interpolate,
  type Path,
  type Point,
} from "./projection";
import type { SummaryStatus } from "./constants";

export type MeasureRow = {
  id: string;
  goal_id: string;
  label: string;
  kind: string;
  unit: string | null;
  direction: string;
  interpolate: string;
  source: string;
  source_params: unknown;
  cadence: string;
  baseline_value: number | null;
  baseline_on: string | null;
  scale: unknown;
  position: number;
};

export type CheckpointRow = {
  id: string;
  measure_id: string;
  target_date: string;
  label: string | null;
  min_value: number | null;
  max_value: number | null;
  relative: boolean;
  hold_until: string | null;
};

export type MeasureSummary = {
  measure: MeasureRow;
  checkpoints: CheckpointRow[];
  path: Path;
  /** What the chart draws as "actual". */
  points: Point[];
  latest: Point | null;
  best: number | null;
  bandToday: Band | null;
  status: SummaryStatus;
  /** Positive = ahead of the path, negative = catching up, in the measure's unit. */
  lead: number;
  covered: number | null;
  needsBaseline: boolean;
  due: boolean;
  /** The next checkpoint still ahead, for "on track for 89–90 by 31 Dec". */
  next: Checkpoint | null;
};

export type LoanParams = { emi: number; lastEmiOn: string };

export function loanParams(value: unknown): LoanParams | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const emi = Number(v.emi);
  const lastEmiOn = typeof v.lastEmiOn === "string" ? v.lastEmiOn : null;
  return Number.isFinite(emi) && emi > 0 && lastEmiOn && /^\d{4}-\d{2}-\d{2}$/.test(lastEmiOn)
    ? { emi, lastEmiOn }
    : null;
}

/**
 * Month-end balances from the EMI schedule. A typed balance overrides the
 * schedule from its date on, then keeps falling by the EMIs still due.
 */
export function loanSeries(params: LoanParams, typed: Point[], fromIso: string, todayIso: string): Point[] {
  const sorted = [...typed].sort((a, b) => a.date.localeCompare(b.date));
  const at = (iso: string) => {
    const override = [...sorted].reverse().find((p) => p.date <= iso);
    if (!override) return loanBalance(params.emi, params.lastEmiOn, iso);
    const paidSince =
      loanBalance(params.emi, params.lastEmiOn, override.date) - loanBalance(params.emi, params.lastEmiOn, iso);
    return Math.max(0, override.value - paidSince);
  };
  const dates = new Set<string>([fromIso, todayIso, ...sorted.map((p) => p.date)]);
  let [y, m] = fromIso.split("-").map(Number);
  const lastMonth = todayIso.slice(0, 7);
  while (`${y}-${String(m).padStart(2, "0")}` <= lastMonth) {
    dates.add(`${y}-${String(m).padStart(2, "0")}-01`);
    [y, m] = m === 12 ? [y + 1, 1] : [y, m + 1];
  }
  return [...dates]
    .filter((d) => d >= fromIso && d <= todayIso)
    .sort()
    .map((date) => ({ date, value: at(date) }));
}

export function toCheckpoint(c: CheckpointRow): Checkpoint {
  return {
    date: c.target_date,
    min: c.min_value === null ? null : Number(c.min_value),
    max: c.max_value === null ? null : Number(c.max_value),
    relative: c.relative,
    holdUntil: c.hold_until,
    label: c.label,
  };
}

/**
 * The baseline is the one set on the measure, or else the first point on or
 * after `startIso` (the goal's start), so an auto source anchors itself.
 */
export function baselineOf(measure: MeasureRow, points: Point[], startIso: string): Baseline | null {
  if (measure.baseline_value !== null && measure.baseline_on) {
    return { date: measure.baseline_on, value: Number(measure.baseline_value) };
  }
  const first = [...points].filter((p) => p.date >= startIso).sort((a, b) => a.date.localeCompare(b.date))[0];
  return first ? { date: first.date, value: first.value } : null;
}

export function summarizeMeasure(input: {
  measure: MeasureRow;
  checkpoints: CheckpointRow[];
  points: Point[];
  goalStart: string;
  todayIso: string;
}): MeasureSummary {
  const { measure, todayIso } = input;
  const direction = measure.direction as Direction;
  const points = [...input.points].sort((a, b) => a.date.localeCompare(b.date));
  const baseline = baselineOf(measure, points, input.goalStart);
  const path: Path = {
    baseline,
    checkpoints: input.checkpoints.map(toCheckpoint),
    interpolate: measure.interpolate as Interpolate,
  };
  const { resolved, needsBaseline } = resolveCheckpoints(path.checkpoints, baseline);
  const sincePlan = baseline ? points.filter((p) => p.date >= baseline.date) : points;
  const latest = points.filter((p) => p.date <= todayIso).at(-1) ?? null;
  const bandToday = expectedBand(path, todayIso);

  let status: SummaryStatus;
  let lead = 0;
  if (resolved.length === 0 && !needsBaseline) status = "no_plan";
  else if (!latest || !bandToday) status = "needs_reading";
  else {
    status = statusOf(direction, bandToday, latest.value);
    lead = leadOver(direction, bandToday, latest.value);
  }

  const auto = measure.source !== "manual";
  return {
    measure,
    checkpoints: input.checkpoints,
    path,
    points,
    latest,
    best: bestValue(direction, sincePlan),
    bandToday,
    status,
    lead,
    covered: distanceCovered(path, direction, sincePlan),
    needsBaseline,
    due: !auto && readingDue(measure.cadence as Cadence, latest?.date ?? null, todayIso),
    next: resolved.find((c) => c.date > todayIso) ?? null,
  };
}
