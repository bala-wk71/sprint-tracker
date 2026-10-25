// What a day of Health logs adds up to: the numbers goal actions count from,
// so a protein or workout target never has to be ticked by hand as well.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export type WorkoutActivity = "strength" | "cardio" | "walk" | "sport" | "other";

/** The one-tap sessions offered in the evening wrap-up. */
export const QUICK_SESSIONS: { name: string; activity: WorkoutActivity }[] = [
  { name: "Push", activity: "strength" },
  { name: "Pull", activity: "strength" },
  { name: "Legs", activity: "strength" },
  { name: "Walk", activity: "walk" },
  { name: "Football", activity: "sport" },
  { name: "Cardio", activity: "cardio" },
];

export const QUICK_MINUTES = [20, 30, 45, 60, 90] as const;

/** Whether a session of this activity counts toward a lever source. */
export function sessionCounts(
  source: "workouts" | "strength" | "cardio" | "sport",
  activity: string | null
): boolean {
  if (source === "workouts") return true;
  if (source === "cardio") return activity === "cardio" || activity === "walk";
  return activity === source;
}

/**
 * A session's activity from the exercises in it: any non-cardio set makes it
 * strength, all-cardio is cardio (or a walk). Null when it has no sets.
 */
export function activityFromSets(sets: { muscle_group: string; name: string }[]): WorkoutActivity | null {
  if (sets.length === 0) return null;
  if (sets.some((s) => s.muscle_group !== "cardio")) return "strength";
  return sets.some((s) => /^walk/i.test(s.name)) ? "walk" : "cardio";
}

/** Same threshold as the protein XP award: the day reaches the target. */
export function hitsProtein(proteinG: number, goal: number | null): boolean {
  return goal !== null && goal > 0 && proteinG >= goal;
}

/** Within 10% either side of the calorie target. */
export function hitsKcal(kcal: number, goal: number | null): boolean {
  return goal !== null && goal > 0 && kcal > 0 && Math.abs(kcal - goal) <= goal * 0.1;
}

export type DayNutrition = { kcal: number; protein_g: number };

/** Logged kcal and protein per day between two dates (inclusive). */
export async function loadDailyNutrition(
  supabase: Client,
  ownerId: string,
  fromIso: string,
  toIso: string
): Promise<Map<string, DayNutrition>> {
  const { data } = await supabase
    .from("meals")
    .select("log_date, meal_items(kcal, protein_g)")
    .eq("owner_id", ownerId)
    .eq("is_template", false)
    .gte("log_date", fromIso)
    .lte("log_date", toIso);

  const out = new Map<string, DayNutrition>();
  for (const meal of data ?? []) {
    if (!meal.log_date) continue;
    const day = out.get(meal.log_date) ?? { kcal: 0, protein_g: 0 };
    for (const item of meal.meal_items ?? []) {
      day.kcal += Number(item.kcal);
      day.protein_g += Number(item.protein_g);
    }
    out.set(meal.log_date, day);
  }
  return out;
}
