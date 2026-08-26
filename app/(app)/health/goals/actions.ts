"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, getUser } from "@/lib/supabase/server";

export type GoalsResult = { ok: true } | { ok: false; error: string };

/**
 * Every field is nullable and optional: the form saves one control at a time,
 * and clearing a goal (sending null) has to be distinguishable from not
 * touching it (sending undefined).
 */
const goalsSchema = z.object({
  heightCm: z.number().min(50).max(280).nullable().optional(),
  sex: z.enum(["male", "female", "other"]).nullable().optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  goalType: z.enum(["cut", "bulk", "recomp", "maintain"]).optional(),
  targetWeightKg: z.number().min(20).max(400).nullable().optional(),
  dailyWaterMlGoal: z.number().int().min(200).max(10000).optional(),
  dailyKcalGoal: z.number().int().min(500).max(10000).nullable().optional(),
  dailyProteinGGoal: z.number().int().min(10).max(500).nullable().optional(),
  weeklyWorkoutGoal: z.number().int().min(0).max(14).optional(),
  weightUnit: z.enum(["kg", "lb"]).optional(),
  volumeUnit: z.enum(["ml", "oz"]).optional(),
});

const COLUMNS: Record<keyof z.infer<typeof goalsSchema>, string> = {
  heightCm: "height_cm",
  sex: "sex",
  birthDate: "birth_date",
  goalType: "goal_type",
  targetWeightKg: "target_weight_kg",
  dailyWaterMlGoal: "daily_water_ml_goal",
  dailyKcalGoal: "daily_kcal_goal",
  dailyProteinGGoal: "daily_protein_g_goal",
  weeklyWorkoutGoal: "weekly_workout_goal",
  weightUnit: "weight_unit",
  volumeUnit: "volume_unit",
};

export async function updateHealthGoals(
  input: z.infer<typeof goalsSchema>
): Promise<GoalsResult> {
  const parsed = goalsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const user = await getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value === undefined) continue;
    updates[COLUMNS[key as keyof typeof COLUMNS]] = value;
  }

  if (Object.keys(updates).length === 0) return { ok: true };

  const supabase = await createClient();
  // Upsert rather than update: the profile row is created lazily, so the first
  // goal a user sets is also what brings the row into existence.
  const { error } = await supabase
    .from("health_profiles")
    .upsert({ owner_id: user.id, ...updates }, { onConflict: "owner_id" });

  if (error) return { ok: false, error: error.message };

  for (const path of ["/health", "/health/goals", "/health/eat", "/health/body"]) {
    revalidatePath(path);
  }

  return { ok: true };
}
