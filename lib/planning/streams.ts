// Streams: the fronts of a life (IT job, Dad's company, Health, Embedded…).
// A goal belongs to its own stream, or else to its nearest ancestor's, so a
// quarter goal under "Company profit" counts towards the company stream.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { GOAL_AREA_VALUES, type GoalArea } from "@/lib/goals/constants";
import { loadLinkedHours, loadMeasureSummaries } from "./load";
import type { MeasureSummary } from "./summary";
import type { SummaryStatus } from "./constants";

type Client = SupabaseClient<Database>;

export type StreamOption = { id: string; name: string; area: GoalArea };

const toArea = (value: string): GoalArea =>
  (GOAL_AREA_VALUES as readonly string[]).includes(value) ? (value as GoalArea) : "self";

export async function loadStreamOptions(supabase: Client, ownerId: string): Promise<StreamOption[]> {
  const { data } = await supabase
    .from("streams")
    .select("id, name, area")
    .eq("owner_id", ownerId)
    .is("archived_at", null)
    .order("position")
    .order("created_at");
  return (data ?? []).map((s) => ({ id: s.id, name: s.name, area: toArea(s.area) }));
}

type StreamGoal = {
  id: string;
  parent_id: string | null;
  stream_id: string | null;
  title: string;
  status: string;
  level: string | null;
  start_date: string;
  target_date: string;
};

/** Each goal's stream: its own, or the nearest ancestor's. */
export function effectiveStreams(goals: Pick<StreamGoal, "id" | "parent_id" | "stream_id">[]): Map<string, string | null> {
  const byId = new Map(goals.map((g) => [g.id, g]));
  const out = new Map<string, string | null>();
  for (const g of goals) {
    let cursor: typeof g | undefined = g;
    let found: string | null = null;
    for (let depth = 0; cursor && depth < 20; depth++) {
      if (cursor.stream_id) {
        found = cursor.stream_id;
        break;
      }
      cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
    }
    out.set(g.id, found);
  }
  return out;
}

export type StreamOverview = {
  id: string;
  name: string;
  area: GoalArea;
  weeklyHours: number | null;
  /** Active goals in the stream, destinations before quarters and projects. */
  goals: StreamGoal[];
  hoursWeek: number;
  /** Every measure on the stream's active goals. */
  summaries: (MeasureSummary & { goalTitle: string })[];
  counts: Partial<Record<SummaryStatus, number>>;
  readingsDue: number;
};

const LEVEL_ORDER: Record<string, number> = { destination: 0, year: 1, quarter: 2, project: 3 };

export async function loadStreamsOverview(
  supabase: Client,
  ownerId: string,
  todayIso: string,
  weekStart: string,
  onlyStreamId?: string
): Promise<StreamOverview[]> {
  const [{ data: streamRows }, { data: goalRows }, hours] = await Promise.all([
    supabase
      .from("streams")
      .select("id, name, area, weekly_hours")
      .eq("owner_id", ownerId)
      .is("archived_at", null)
      .order("position")
      .order("created_at"),
    supabase
      .from("goals")
      .select("id, parent_id, stream_id, title, status, level, start_date, target_date")
      .eq("owner_id", ownerId),
    loadLinkedHours(supabase, ownerId, weekStart),
  ]);
  const streams = (streamRows ?? []).filter((s) => !onlyStreamId || s.id === onlyStreamId);
  if (streams.length === 0) return [];

  const goals = (goalRows ?? []) as StreamGoal[];
  const streamOf = effectiveStreams(goals);
  const active = goals.filter((g) => g.status === "active" && streamOf.get(g.id));
  const summaries = await loadMeasureSummaries(supabase, ownerId, active, todayIso);
  const titleOf = new Map(goals.map((g) => [g.id, g.title]));

  return streams.map((s) => {
    const inStream = active
      .filter((g) => streamOf.get(g.id) === s.id)
      .sort(
        (a, b) =>
          (LEVEL_ORDER[a.level ?? "destination"] ?? 0) - (LEVEL_ORDER[b.level ?? "destination"] ?? 0) ||
          a.target_date.localeCompare(b.target_date)
      );
    const streamSummaries = inStream.flatMap((g) =>
      (summaries.get(g.id) ?? []).map((m) => ({ ...m, goalTitle: titleOf.get(g.id) ?? "" }))
    );
    const counts: Partial<Record<SummaryStatus, number>> = {};
    for (const m of streamSummaries) counts[m.status] = (counts[m.status] ?? 0) + 1;
    const hoursWeek = hours
      .filter((h) => streamOf.get(h.goalId) === s.id)
      .reduce((sum, h) => sum + h.hours, 0);
    return {
      id: s.id,
      name: s.name,
      area: toArea(s.area),
      weeklyHours: s.weekly_hours === null ? null : Number(s.weekly_hours),
      goals: inStream,
      hoursWeek: Math.round(hoursWeek * 10) / 10,
      summaries: streamSummaries,
      counts,
      readingsDue: streamSummaries.filter((m) => m.due).length,
    };
  });
}
