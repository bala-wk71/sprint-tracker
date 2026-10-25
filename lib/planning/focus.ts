// The limits on goals. A week has 168 hours; sleep, the job and everyday
// overhead come out first, and the streams share what is left. Only three
// streams are pushed at a time; the rest are kept up on their hours alone.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export const PUSH_LIMIT = 3;

export type StreamFocus = "push" | "maintain";

export type TimeBudget = { sleepHours: number; jobHours: number; overheadHours: number };

export const DEFAULT_TIME_BUDGET: TimeBudget = { sleepHours: 8, jobHours: 40, overheadHours: 21 };

/** Hours a week left for the streams once sleep, the job and overhead are out. */
export function freeHours(b: TimeBudget): number {
  return Math.max(0, Math.round((168 - b.sleepHours * 7 - b.jobHours - b.overheadHours) * 10) / 10);
}

/** Null when the streams' hours fit the week, otherwise what to say. */
export function budgetProblem(plannedHours: number, free: number): string | null {
  if (plannedHours <= free) return null;
  const over = Math.round((plannedHours - free) * 10) / 10;
  return `That plans ${plannedHours}h a week, ${over}h more than the ${free}h you have free. Take the hours from another stream, or archive one, first.`;
}

/**
 * A goal that has to be worked on now: not a long-range destination, already
 * started, and ending within a year. Those only go in a push stream.
 */
export function isShortGoal(g: { level: string | null; start_date: string; target_date: string }, todayIso: string): boolean {
  if (g.level === "destination") return false;
  if (g.start_date > todayIso) return false;
  const yearOut = new Date(Date.parse(`${todayIso}T00:00:00Z`) + 366 * 86_400_000).toISOString().slice(0, 10);
  return g.target_date <= yearOut;
}

export function maintainMessage(streamName: string): string {
  return `${streamName} is on maintain, so it holds hours, not new short goals. Make it a push stream on the Streams page (up to ${PUSH_LIMIT}), or put this goal in one.`;
}

export const PUSH_LIMIT_MESSAGE = `You already push ${PUSH_LIMIT} streams. Set one to maintain first: more than ${PUSH_LIMIT} at once is how goals turn into noise.`;

export async function loadTimeBudget(supabase: Client, ownerId: string): Promise<TimeBudget> {
  const { data } = await supabase
    .from("time_budgets")
    .select("sleep_hours, job_hours, overhead_hours")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!data) return DEFAULT_TIME_BUDGET;
  return { sleepHours: Number(data.sleep_hours), jobHours: Number(data.job_hours), overheadHours: Number(data.overhead_hours) };
}

/**
 * Null when a goal may be active in this stream, otherwise why not. Goals
 * outside any stream, and long-range ones, are always fine.
 */
export async function goalFocusProblem(
  supabase: Client,
  ownerId: string,
  goal: { stream_id: string | null; level: string | null; start_date: string; target_date: string },
  todayIso: string
): Promise<string | null> {
  if (!goal.stream_id || !isShortGoal(goal, todayIso)) return null;
  const { data: stream } = await supabase
    .from("streams")
    .select("name, focus")
    .eq("id", goal.stream_id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  return stream && stream.focus === "maintain" ? maintainMessage(stream.name) : null;
}
