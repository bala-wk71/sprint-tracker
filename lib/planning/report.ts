// The numbers behind every plan report, per stream: each target against its
// path, the weekly actions kept, hours, steps and todos done, and what moved
// it. Computed by code; the monthly, quarterly and yearly reports only put
// words to these.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { addDaysIso, type WeekStartDay } from "@/lib/week";
import { GOAL_AREA_VALUES, type GoalArea } from "@/lib/goals/constants";
import { formatBand, formatMeasure } from "./format";
import { latestOnOrBefore, resolveCheckpoints, statusOf, type Band, type Direction } from "./projection";
import { loadLeverDaily, loadLevers, loadLinkedHours, loadMeasureSummaries, sumBetween, type LeverRow } from "./load";
import { effectiveStreams } from "./streams";
import { recentChange, weeklyChanges, whatMovedIt, type MovedIt } from "./drivers";
import { forecastLine, headline } from "./wording";
import { periodLabel, periodRange, weekStartsIn, type ReportPeriod } from "./periods";
import type { MeasureSummary } from "./summary";
import type { SummaryStatus } from "./constants";

type Client = SupabaseClient<Database>;

/** How many weeks of history "what moved it" compares. */
const DRIVER_WEEKS = 12;

export type CheckpointResult = { date: string; label: string | null; target: string; value: number | null; hit: boolean | null };

export type MeasureNumbers = {
  id: string;
  goalId: string;
  goalTitle: string;
  label: string;
  unit: string | null;
  direction: string;
  startValue: number | null;
  endValue: number | null;
  change: number | null;
  band: Band | null;
  status: SummaryStatus;
  headline: string;
  covered: number | null;
  best: number | null;
  /** Only when the period includes today. */
  forecast: string | null;
  replan: boolean;
  /** Checkpoints due inside the period, and whether each was reached. */
  checkpoints: CheckpointResult[];
  /** The last checkpoint before the period, for "missed twice". */
  earlier: CheckpointResult | null;
  movedIt: MovedIt[];
  recent: { last4: number; prev4: number } | null;
  due: boolean;
};

export type LeverNumbers = {
  id: string;
  title: string;
  source: string;
  goalTitle: string;
  period: "week" | "month";
  target: number;
  floor: number;
  /** `partial`: the week or month is still running, so it isn't judged yet. */
  counts: { start: string; done: number; partial: boolean }[];
  /** Finished weeks (or months), and how many were at target and at least at the floor. */
  complete: number;
  kept: number;
  floorKept: number;
};

export type StepDone = { title: string; goalTitle: string };

export type StreamNumbers = {
  id: string | null;
  name: string;
  area: GoalArea;
  hoursDone: number;
  hoursPlanned: number | null;
  measures: MeasureNumbers[];
  levers: LeverNumbers[];
  stepsDone: StepDone[];
  stepsOpen: StepDone[];
  todosDone: number;
  projects: { id: string; title: string; level: string | null; targetDate: string; stepsDone: number; stepsTotal: number }[];
};

export type ReportNumbers = {
  period: ReportPeriod;
  start: string;
  end: string;
  /** The last day counted: the period's end, or today while it's running. */
  asOf: string;
  label: string;
  inProgress: boolean;
  streams: StreamNumbers[];
};

type GoalRow = {
  id: string;
  parent_id: string | null;
  stream_id: string | null;
  title: string;
  status: string;
  level: string | null;
  start_date: string;
  target_date: string;
  completed_at: string | null;
};

const toArea = (value: string): GoalArea =>
  (GOAL_AREA_VALUES as readonly string[]).includes(value) ? (value as GoalArea) : "self";

/** Whether a value reached a checkpoint's band, read in the measure's direction. */
function reached(direction: Direction, band: Band, value: number): boolean {
  const status = statusOf(direction, band, value);
  return status === "ahead" || status === "on_track";
}

function checkpointResults(s: MeasureSummary, fromIso: string, toIso: string): CheckpointResult[] {
  const { resolved } = resolveCheckpoints(s.path.checkpoints, s.path.baseline);
  const direction = s.measure.direction as Direction;
  return resolved
    .filter((c) => c.date >= fromIso && c.date <= toIso)
    .map((c) => {
      const point = latestOnOrBefore(s.points, c.date);
      // A reading from long before the checkpoint doesn't say where it ended up.
      const value = point && point.date >= addDaysIso(c.date, -45) ? point.value : null;
      return {
        date: c.date,
        label: c.label ?? null,
        target: formatBand(c.min, c.max, s.measure.unit),
        value,
        hit: value === null ? null : reached(direction, { min: c.min, max: c.max }, value),
      };
    });
}

function measureNumbers(
  s: MeasureSummary,
  goalTitle: string,
  range: { start: string; end: string; asOf: string },
  inProgress: boolean,
  driverWeeks: string[],
  levers: { id: string; title: string; target: number; byWeek: Map<string, number> }[]
): MeasureNumbers {
  const before = latestOnOrBefore(s.points, addDaysIso(range.start, -1));
  const firstIn = s.points.find((p) => p.date >= range.start && p.date <= range.asOf) ?? null;
  const startPoint = before ?? firstIn;
  const endPoint = latestOnOrBefore(s.points, range.asOf);
  const endValue = endPoint && endPoint.date >= range.start ? endPoint.value : null;
  const direction = s.measure.direction as Direction;
  const weekly = s.measure.cadence === "weekly";
  const forecast = inProgress ? forecastLine(s, range.asOf) : null;
  const earlier = checkpointResults(s, "0000-01-01", addDaysIso(range.start, -1)).at(-1) ?? null;

  return {
    id: s.measure.id,
    goalId: s.measure.goal_id,
    goalTitle,
    label: s.measure.label,
    unit: s.measure.unit,
    direction,
    startValue: startPoint?.value ?? null,
    endValue,
    change: startPoint && endValue !== null ? endValue - startPoint.value : null,
    band: s.bandToday,
    status: s.status,
    headline: headline(s, range.asOf),
    covered: s.covered,
    best: s.best,
    forecast: forecast?.text ?? null,
    replan: forecast?.replan ?? false,
    checkpoints: checkpointResults(s, range.start, range.asOf),
    earlier,
    movedIt: weekly ? whatMovedIt(weeklyChanges(s.points, driverWeeks), direction, levers).slice(0, 2) : [],
    recent: weekly ? recentChange(s.points, range.asOf) : null,
    due: s.due,
  };
}

function leverNumbers(
  lever: LeverRow,
  goalTitle: string,
  daily: Map<string, number> | undefined,
  range: { start: string; end: string; asOf: string },
  weeks: string[]
): LeverNumbers {
  const starts =
    lever.period === "week"
      ? weeks
      : [...new Set(weeks.map((w) => `${w.slice(0, 7)}-01`).concat(`${range.start.slice(0, 7)}-01`))].sort();
  // Weeks before the action existed say nothing about keeping it.
  const since = lever.created_at.slice(0, 10);
  const endOf = (start: string) => (lever.period === "week" ? addDaysIso(start, 6) : periodRange("month", start, 1).end);
  const counts = starts
    .filter((start) => start <= range.asOf && endOf(start) >= since)
    .map((start) => {
      const end = endOf(start);
      return { start, done: sumBetween(daily, start, [end, range.asOf].sort()[0]), partial: end > range.asOf };
    });
  const finished = counts.filter((c) => !c.partial);
  return {
    id: lever.id,
    title: lever.title,
    source: lever.source,
    goalTitle,
    period: lever.period,
    target: lever.target,
    floor: lever.floor,
    counts,
    complete: finished.length,
    kept: finished.filter((c) => c.done >= lever.target).length,
    floorKept: finished.filter((c) => c.done >= lever.floor).length,
  };
}

/**
 * Everything a report says, for the period containing `anyDateIso`. While
 * the period is running, numbers run to today and forecasts are included.
 */
export async function buildReportNumbers(
  supabase: Client,
  ownerId: string,
  period: ReportPeriod,
  anyDateIso: string,
  todayIso: string,
  weekStartDay: WeekStartDay
): Promise<ReportNumbers> {
  const { start, end } = periodRange(period, anyDateIso, weekStartDay);
  const asOf = end < todayIso ? end : todayIso;
  const inProgress = asOf === todayIso && end >= todayIso;
  const range = { start, end, asOf };
  const weeks = period === "week" ? [start] : weekStartsIn(start, asOf, weekStartDay);
  const lastWeekStart = weekStartsIn(addDaysIso(asOf, -6), asOf, weekStartDay)[0] ?? addDaysIso(asOf, -6);
  const driverWeeks = Array.from({ length: DRIVER_WEEKS }, (_, i) => addDaysIso(lastWeekStart, -7 * (DRIVER_WEEKS - 1 - i)))
    // A week still under way would read as a slow week.
    .filter((w) => addDaysIso(w, 6) <= asOf);

  const [{ data: streamRows }, { data: goalRows }] = await Promise.all([
    supabase
      .from("streams")
      .select("id, name, area, weekly_hours, created_at")
      .eq("owner_id", ownerId)
      .is("archived_at", null)
      .order("position")
      .order("created_at"),
    supabase
      .from("goals")
      .select("id, parent_id, stream_id, title, status, level, start_date, target_date, completed_at")
      .eq("owner_id", ownerId),
  ]);
  const allGoals = (goalRows ?? []) as GoalRow[];
  // Goals that were live at some point in the period.
  const goals = allGoals.filter(
    (g) =>
      g.start_date <= asOf &&
      (g.status === "active" || ((g.status === "done" || g.status === "let_go") && (g.completed_at ?? "") >= start))
  );
  const goalIds = goals.map((g) => g.id);
  const titleOf = new Map(allGoals.map((g) => [g.id, g.title]));
  const streamOf = effectiveStreams(allGoals);

  const historyFrom = [start, driverWeeks[0] ?? start].sort()[0];
  const levers = await loadLevers(supabase, ownerId, goalIds);
  const [summaries, daily, hours, { data: steps }, { data: todos }] = await Promise.all([
    loadMeasureSummaries(supabase, ownerId, goals, asOf),
    loadLeverDaily(supabase, ownerId, levers, allGoals, historyFrom, asOf),
    loadLinkedHours(supabase, ownerId, start),
    goalIds.length
      ? supabase.from("goal_steps").select("goal_id, title, done_at").eq("owner_id", ownerId).in("goal_id", goalIds)
      : Promise.resolve({ data: [] as { goal_id: string; title: string; done_at: string | null }[] }),
    goalIds.length
      ? supabase
          .from("todo_tasks")
          .select("goal_id")
          .eq("owner_id", ownerId)
          .in("goal_id", goalIds)
          .gte("completed_at", `${start}T00:00:00`)
          .lt("completed_at", `${addDaysIso(asOf, 1)}T00:00:00`)
      : Promise.resolve({ data: [] as { goal_id: string | null }[] }),
  ]);

  const byWeekOf = (lever: LeverRow) => {
    const days = daily.get(lever.id);
    const since = lever.created_at.slice(0, 10);
    return new Map(
      driverWeeks.filter((w) => addDaysIso(w, 6) >= since).map((w) => [w, sumBetween(days, w, addDaysIso(w, 6))])
    );
  };

  const buckets: { id: string | null; name: string; area: GoalArea; weeklyHours: number | null; since: string }[] = [
    ...(streamRows ?? []).map((s) => ({
      id: s.id as string | null,
      name: s.name,
      area: toArea(s.area),
      weeklyHours: s.weekly_hours === null ? null : Number(s.weekly_hours),
      since: s.created_at.slice(0, 10),
    })),
    { id: null, name: "Goals without a stream", area: "self", weeklyHours: null, since: start },
  ];

  // Planned hours count from when the stream began, not from the start of a long period.
  const weeksElapsed = (since: string) => {
    const from = since > start ? since : start;
    return Math.max(1, Math.round(((Date.parse(asOf) - Date.parse(from)) / 86_400_000 + 1) / 7));
  };
  const streams: StreamNumbers[] = buckets.map((bucket) => {
    const inBucket = goals.filter((g) => (streamOf.get(g.id) ?? null) === bucket.id);
    const ids = new Set(inBucket.map((g) => g.id));
    const bucketLevers = levers.filter((l) => ids.has(l.goal_id));
    const driverLevers = bucketLevers
      .filter((l) => l.period === "week")
      .map((l) => ({ id: l.id, title: l.title, target: l.target, byWeek: byWeekOf(l) }));
    const stepsHere = (steps ?? []).filter((s) => ids.has(s.goal_id));
    const doneInPeriod = stepsHere.filter((s) => s.done_at && s.done_at.slice(0, 10) >= start && s.done_at.slice(0, 10) <= asOf);
    const liveProjects = inBucket.filter(
      (g) => g.status === "active" && (g.level === "quarter" || g.level === "project") && g.target_date >= start
    );
    const liveIds = new Set(liveProjects.map((g) => g.id));

    return {
      id: bucket.id,
      name: bucket.name,
      area: bucket.area,
      hoursDone:
        Math.round(
          hours.filter((h) => ids.has(h.goalId) && h.date <= asOf).reduce((sum, h) => sum + h.hours, 0) * 10
        ) / 10,
      hoursPlanned: bucket.weeklyHours === null ? null : bucket.weeklyHours * weeksElapsed(bucket.since),
      measures: inBucket.flatMap((g) =>
        (summaries.get(g.id) ?? []).map((s) =>
          measureNumbers(s, g.title, range, inProgress, driverWeeks, driverLevers)
        )
      ),
      levers: bucketLevers.map((l) => leverNumbers(l, titleOf.get(l.goal_id) ?? "", daily.get(l.id), range, weeks)),
      stepsDone: doneInPeriod.map((s) => ({ title: s.title, goalTitle: titleOf.get(s.goal_id) ?? "" })),
      stepsOpen: stepsHere
        .filter((s) => !s.done_at && liveIds.has(s.goal_id))
        .slice(0, 12)
        .map((s) => ({ title: s.title, goalTitle: titleOf.get(s.goal_id) ?? "" })),
      todosDone: (todos ?? []).filter((t) => t.goal_id && ids.has(t.goal_id)).length,
      projects: liveProjects.map((g) => {
        const own = stepsHere.filter((s) => s.goal_id === g.id);
        return {
          id: g.id,
          title: g.title,
          level: g.level,
          targetDate: g.target_date,
          stepsDone: own.filter((s) => s.done_at).length,
          stepsTotal: own.length,
        };
      }),
    };
  });

  return {
    period,
    start,
    end,
    asOf,
    label: periodLabel(period, start),
    inProgress,
    // A stream with nothing in it has nothing to report.
    streams: streams.filter(
      (s) => s.measures.length || s.levers.length || s.stepsDone.length || s.projects.length || s.hoursDone > 0 || s.todosDone > 0
    ),
  };
}

/** "0.8 kg down", "₹20,000 up", "no change". */
export function changeText(delta: number | null, unit: string | null): string | null {
  if (delta === null) return null;
  if (Math.abs(delta) < 1e-9) return "no change";
  return `${formatMeasure(Math.abs(delta), unit)} ${delta < 0 ? "down" : "up"}`;
}

/** "Weeks you hit Strength ×4 (5): 0.8 kg down a week on average; other weeks (3): 0.2 kg down." */
export function movedItText(m: MovedIt, unit: string | null): string {
  const per = (v: number) => (Math.abs(v) < 1e-9 ? "no change" : `${changeText(v, unit)} a week`);
  return `Weeks you hit “${m.leverTitle}” (${m.keptWeeks}): ${per(m.keptChange)} on average; other weeks (${m.otherWeeks}): ${per(m.otherChange)}.`;
}
