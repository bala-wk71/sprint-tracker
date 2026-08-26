import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { createClient, getUser } from "@/lib/supabase/server";
import { DEFAULT_HEALTH_PROFILE, type HealthProfile } from "./constants";

type Client = SupabaseClient<Database>;

export type { HealthProfile };

/**
 * The user's health goals, with defaults filled in.
 *
 * The row is created lazily — the goals form is optional, and someone who just
 * wants to log water should not be made to fill in a profile first. Every
 * reader therefore has to cope with "no row yet", so it happens in one place.
 */
export async function readHealthProfile(
  supabase: Client,
  userId: string
): Promise<HealthProfile> {
  const { data } = await supabase
    .from("health_profiles")
    .select(
      "height_cm, sex, birth_date, goal_type, target_weight_kg, daily_water_ml_goal, daily_kcal_goal, daily_protein_g_goal, weekly_workout_goal, weight_unit, volume_unit"
    )
    .eq("owner_id", userId)
    .maybeSingle();

  if (!data) return { ...DEFAULT_HEALTH_PROFILE };

  return {
    height_cm: data.height_cm,
    sex: data.sex,
    birth_date: data.birth_date,
    goal_type: data.goal_type,
    target_weight_kg: data.target_weight_kg,
    daily_water_ml_goal: data.daily_water_ml_goal,
    daily_kcal_goal: data.daily_kcal_goal,
    daily_protein_g_goal: data.daily_protein_g_goal,
    weekly_workout_goal: data.weekly_workout_goal,
    weight_unit: data.weight_unit,
    volume_unit: data.volume_unit,
  };
}

/** Request-memoized version for server components. */
export const getHealthProfile = cache(async (): Promise<HealthProfile> => {
  const user = await getUser();
  if (!user) return { ...DEFAULT_HEALTH_PROFILE };
  const supabase = await createClient();
  return readHealthProfile(supabase, user.id);
});
