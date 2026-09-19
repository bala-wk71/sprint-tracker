// Server-side loading for goal plans: measures with their path and actual
// points (typed, or read live from Health and loan schedules), levers with
// this period's count, and hours logged on linked work.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { addDaysIso } from "@/lib/week";
import { trailingAverage, type Point } from "./projection";
import { BODY_COLUMNS, isBodySource, type LeverSource } from "./constants";
import {
  loanParams,
  loanSeries,
  summarizeMeasure,
  type CheckpointRow,
  type MeasureRow,
  type MeasureSummary,
} from "./summary";

type Client = SupabaseClient<Database>;

export type PlanGoal = { id: string; start_date: string };
export type GoalNode = { id: string; parent_id: string | null };

const MEASURE_COLUMNS =
  "id, goal_id, label, kind, unit, direction, interpolate, source, source_params, cadence, baseline_value, baseline_on, scale, position";

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

/** Every measure on the given goals, summarised, keyed by goal id. */
export async function loadMeasureSummaries(
  supabase: Client,
  ownerId: string,
  goals: PlanGoal[],
  todayIso: string
): Promise<Map<string, MeasureSummary[]>> {
  const byGoal = new Map<string, MeasureSummary[]>();
  if (goals.length === 0) return byGoal;
  const startOf = new Map(goals.map((g) => [g.id, g.start_date]));

  const { data: measureRows } = await supabase
    .from("goal_measures")
    .select(MEASURE_COLUMNS)
    .eq("owner_id", ownerId)
    .in("goal_id", goals.map((g) => g.id))
    .order("position");
  const measures = (measureRows ?? []) as MeasureRow[];
  if (measures.length === 0) return byGoal;
  const measureIds = measures.map((m) => m.id);

  const bodyColumns = [
    ...new Set(measures.flatMap((m) => (isBodySource(m.source) ? [BODY_COLUMNS[m.source]] : []))),
  ];
  const earliest = measures
    .map((m) => [m.baseline_on, startOf.get(m.goal_id)].filter(Boolean).sort()[0] as string)
    .sort()[0];
  // A week before the earliest start, so the first 7-day average has history.
  const bodySince = addDaysIso(earliest, -7);

  const [{ data: checkpointRows }, { data: readingRows }, { data: bodyRows }] = await Promise.all([
    supabase
      .from("measure_checkpoints")
      .select("id, measure_id, target_date, label, min_value, max_value, relative, hold_until")
      .eq("owner_id", ownerId)
      .in("measure_id", measureIds)
      .order("target_date"),
    supabase
      .from("measure_readings")
      .select("measure_id, measured_on, value")
      .eq("owner_id", ownerId)
      .in("measure_id", measureIds)
      .order("measured_on"),
    bodyColumns.length
      ? supabase
          .from("body_metrics")
          .select(`measured_on, ${bodyColumns.join(", ")}`)
          .eq("owner_id", ownerId)
          .gte("measured_on", bodySince)
          .order("measured_on")
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const checkpointsOf = new Map<string, CheckpointRow[]>();
  for (const c of (checkpointRows ?? []) as CheckpointRow[]) {
    const list = checkpointsOf.get(c.measure_id) ?? [];
    list.push(c);
    checkpointsOf.set(c.measure_id, list);
  }
  const typedOf = new Map<string, Point[]>();
  for (const r of readingRows ?? []) {
    const list = typedOf.get(r.measure_id) ?? [];
    list.push({ date: r.measured_on, value: Number(r.value) });
    typedOf.set(r.measure_id, list);
  }
  const bodySeries = new Map<string, Point[]>();
  for (const column of bodyColumns) {
    const points: Point[] = [];
    for (const row of (bodyRows ?? []) as Record<string, unknown>[]) {
      const v = row[column];
      if (v !== null && v !== undefined) points.push({ date: String(row.measured_on), value: Number(v) });
    }
    bodySeries.set(column, column === "weight_kg" ? trailingAverage(points, 7) : points);
  }

  for (const measure of measures) {
    const goalStart = startOf.get(measure.goal_id) ?? todayIso;
    const typed = typedOf.get(measure.id) ?? [];
    let points: Point[] = typed;
    if (isBodySource(measure.source)) {
      points = bodySeries.get(BODY_COLUMNS[measure.source]) ?? [];
    } else if (measure.source === "loan_schedule") {
      const params = loanParams(measure.source_params);
      if (params) points = loanSeries(params, typed, measure.baseline_on ?? goalStart, todayIso);
    }
    const summary = summarizeMeasure({
      measure,
      checkpoints: checkpointsOf.get(measure.id) ?? [],
      points,
      goalStart,
      todayIso,
    });
    const list = byGoal.get(measure.goal_id) ?? [];
    list.push(summary);
    byGoal.set(measure.goal_id, list);
  }
  return byGoal;
}

/** A goal and every goal under it, for rolling work up the cascade. */
export function subtreeIds(rootId: string, goals: GoalNode[]): string[] {
  const children = new Map<string, string[]>();
  for (const g of goals) {
    if (!g.parent_id) continue;
    const list = children.get(g.parent_id) ?? [];
    list.push(g.id);
    children.set(g.parent_id, list);
  }
  const seen = new Set<string>();
  const stack = [rootId];
  while (stack.length && seen.size < 500) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return [...seen];
}

/** The nearest goal at or above this one that has measures, for quarter goals that share their parent's path. */
export function planOwnerId(goalId: string, goals: GoalNode[], hasMeasures: (id: string) => boolean): string | null {
  const parentOf = new Map(goals.map((g) => [g.id, g.parent_id]));
  let cursor: string | null = goalId;
  for (let depth = 0; cursor && depth < 20; depth++) {
    if (hasMeasures(cursor)) return cursor;
    cursor = parentOf.get(cursor) ?? null;
  }
  return null;
}

export type LinkedHour = { goalId: string; date: string; hours: number };

/** Time logged on sprint tasks linked to any goal, since a date. */
export async function loadLinkedHours(supabase: Client, ownerId: string, sinceIso: string): Promise<LinkedHour[]> {
  const { data } = await supabase
    .from("time_entries")
    .select("duration_hours, daily_logs!inner(log_date), tasks!inner(goal_id)")
    .eq("owner_id", ownerId)
    .not("tasks.goal_id", "is", null)
    .gte("daily_logs.log_date", sinceIso);
  return (data ?? []).flatMap((row) => {
    const goalId = one(row.tasks as { goal_id: string | null } | { goal_id: string | null }[] | null)?.goal_id;
    const date = one(row.daily_logs as { log_date: string } | { log_date: string }[] | null)?.log_date;
    return goalId && date ? [{ goalId, date, hours: Number(row.duration_hours || 0) }] : [];
  });
}

export type LeverRow = {
  id: string;
  goal_id: string;
  title: string;
  source: LeverSource;
  period: "week" | "month";
  target: number;
  floor: number;
  position: number;
};

export type LeverSummary = LeverRow & {
  periodStart: string;
  done: number;
  doneToday: number;
};

/** Levers on the given goals with what's been done this week or month. */
export async function loadLeverSummaries(
  supabase: Client,
  ownerId: string,
  goalIds: string[],
  allGoals: GoalNode[],
  todayIso: string,
  weekStart: string
): Promise<LeverSummary[]> {
  if (goalIds.length === 0) return [];
  const { data: leverRows } = await supabase
    .from("goal_levers")
    .select("id, goal_id, title, source, period, target, floor, position")
    .eq("owner_id", ownerId)
    .in("goal_id", goalIds)
    .is("archived_at", null)
    .order("position");
  const levers = ((leverRows ?? []) as LeverRow[]).map((l) => ({
    ...l,
    target: Number(l.target),
    floor: Number(l.floor),
  }));
  if (levers.length === 0) return [];

  const monthStart = `${todayIso.slice(0, 8)}01`;
  const startOf = (l: LeverRow) => (l.period === "month" ? monthStart : weekStart);
  const since = [weekStart, monthStart].sort()[0];
  const needs = (source: LeverSource) => levers.some((l) => l.source === source);

  const [{ data: ticks }, { data: workouts }, hours] = await Promise.all([
    needs("tick")
      ? supabase
          .from("lever_ticks")
          .select("lever_id, done_on, count")
          .eq("owner_id", ownerId)
          .in("lever_id", levers.map((l) => l.id))
          .gte("done_on", since)
      : Promise.resolve({ data: [] as { lever_id: string; done_on: string; count: number }[] }),
    needs("workouts")
      ? supabase.from("workouts").select("log_date").eq("owner_id", ownerId).gte("log_date", since)
      : Promise.resolve({ data: [] as { log_date: string }[] }),
    needs("linked_hours") ? loadLinkedHours(supabase, ownerId, since) : Promise.resolve([] as LinkedHour[]),
  ]);

  return levers.map((lever) => {
    const start = startOf(lever);
    let done = 0;
    let doneToday = 0;
    if (lever.source === "tick") {
      for (const t of ticks ?? []) {
        if (t.lever_id !== lever.id || t.done_on < start) continue;
        done += Number(t.count);
        if (t.done_on === todayIso) doneToday += Number(t.count);
      }
    } else if (lever.source === "workouts") {
      for (const w of workouts ?? []) {
        if (w.log_date < start) continue;
        done += 1;
        if (w.log_date === todayIso) doneToday += 1;
      }
    } else {
      const ids = new Set(subtreeIds(lever.goal_id, allGoals));
      for (const h of hours) {
        if (!ids.has(h.goalId) || h.date < start) continue;
        done += h.hours;
        if (h.date === todayIso) doneToday += h.hours;
      }
    }
    return { ...lever, periodStart: start, done: Math.round(done * 10) / 10, doneToday };
  });
}
