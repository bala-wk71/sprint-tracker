// The Push / Pull / Legs split, read back from what was actually trained, so
// starting a gym session means picking the day rather than rebuilding it.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export type SplitDay = "push" | "pull" | "legs";

export const SPLIT_DAYS: { value: SplitDay; label: string }[] = [
  { value: "push", label: "Push" },
  { value: "pull", label: "Pull" },
  { value: "legs", label: "Legs" },
];

// Shoulders and abs show up on every day of the user's split (rear delts on
// pull, presses on push), so they decide nothing and are left out.
const GROUP_DAY: Record<string, SplitDay> = {
  chest: "push",
  triceps: "push",
  back: "pull",
  biceps: "pull",
  quads: "legs",
  hamstrings: "legs",
  legs: "legs",
  glutes: "legs",
  calves: "legs",
};

export const splitLabel = (day: SplitDay) => SPLIT_DAYS.find((d) => d.value === day)!.label;

/** A day named for its split ("Push", "push day", "Legs 2") is taken at its word. */
export function splitFromName(name: string | null): SplitDay | null {
  const m = name?.trim().match(/^(push|pull|legs?)\b/i);
  if (!m) return null;
  const word = m[1].toLowerCase();
  return word === "leg" ? "legs" : (word as SplitDay);
}

function votesOf(muscleGroups: string[]): Record<SplitDay, number> {
  const votes: Record<SplitDay, number> = { push: 0, pull: 0, legs: 0 };
  for (const g of muscleGroups) {
    const day = GROUP_DAY[g];
    if (day) votes[day] += 1;
  }
  return votes;
}

/**
 * Which split day a session was, from its name or else from the muscle group
 * of each exercise in it (one vote per exercise). Null when nothing decides
 * it, or two days tie.
 */
export function splitOfSession(name: string | null, muscleGroups: string[]): SplitDay | null {
  const named = splitFromName(name);
  if (named) return named;
  const ranked = (Object.entries(votesOf(muscleGroups)) as [SplitDay, number][]).sort((a, b) => b[1] - a[1]);
  if (ranked[0][1] === 0 || ranked[0][1] === ranked[1][1]) return null;
  return ranked[0][0];
}

/**
 * Whether a session is a whole day worth copying: at least four exercises,
 * and (unless it was named for the day) four in five of them on that day.
 * Short or mixed sessions still count for the rotation, but copying a
 * one-exercise Legs day would leave the next one short too.
 */
export function isFullDay(day: SplitDay, name: string | null, muscleGroups: string[]): boolean {
  if (muscleGroups.length < 4) return false;
  if (splitFromName(name) === day) return true;
  const votes = votesOf(muscleGroups);
  const decisive = votes.push + votes.pull + votes.legs;
  return decisive > 0 && votes[day] / decisive >= 0.8;
}

/** The day after the last one trained: Push, then Pull, then Legs, then Push. */
export function nextSplitDay(last: SplitDay | null): SplitDay {
  if (last === "push") return "pull";
  if (last === "pull") return "legs";
  return "push";
}

export type SplitTemplate = { logDate: string; exerciseIds: string[] };

export type SplitHistory = {
  /** The latest gym session whose day is known, logged with sets or tapped. */
  last: SplitDay | null;
  /** Per day, the latest full session of it (or failing that, any) to copy. */
  templates: Partial<Record<SplitDay, SplitTemplate>>;
};

/** Reads the split back from the last 60 sessions before a date. */
export async function loadSplitHistory(
  supabase: Client,
  ownerId: string,
  beforeIso: string
): Promise<SplitHistory> {
  const { data } = await supabase
    .from("workouts")
    .select("log_date, name, activity, workout_sets(exercise_id, position, exercises(muscle_group))")
    .eq("owner_id", ownerId)
    .lt("log_date", beforeIso)
    .order("log_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(60);

  const out: SplitHistory = { last: null, templates: {} };
  const fallback: SplitHistory["templates"] = {};
  for (const w of data ?? []) {
    if (w.activity && w.activity !== "strength") continue;
    const sets = [...(w.workout_sets ?? [])].sort((a, b) => a.position - b.position);
    const exerciseIds: string[] = [];
    const groups: string[] = [];
    for (const s of sets) {
      if (exerciseIds.includes(s.exercise_id)) continue;
      exerciseIds.push(s.exercise_id);
      const ex = s.exercises as { muscle_group: string } | null;
      if (ex) groups.push(ex.muscle_group);
    }
    const day = splitOfSession(w.name, groups);
    if (!out.last) out.last = day;
    if (!day || exerciseIds.length === 0) continue;
    if (!out.templates[day] && isFullDay(day, w.name, groups)) out.templates[day] = { logDate: w.log_date, exerciseIds };
    if (!fallback[day]) fallback[day] = { logDate: w.log_date, exerciseIds };
  }
  out.templates = { ...fallback, ...out.templates };
  return out;
}
