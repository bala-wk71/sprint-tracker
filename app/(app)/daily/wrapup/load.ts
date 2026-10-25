import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { readHealthProfile } from "@/lib/health/profile";
import { loadSplitHistory, nextSplitDay, type SplitDay } from "@/lib/health/split";
import { loadLeverSummaries, type LeverSummary } from "@/lib/planning/load";
import type { MealType } from "@/lib/health/constants";
import type { VolumeUnit, WeightUnit } from "@/lib/health/units";

type Client = SupabaseClient<Database>;

export type WrapupMeal = { id: string; mealType: MealType; said: string | null; kcal: number; protein_g: number };
export type WrapupSession = { id: string; name: string; activity: string | null; minutes: number | null; sets: number };
export type EndedGoal = { id: string; title: string; targetDate: string; canExtend: boolean };

export type WrapupBodyData = {
  meals: WrapupMeal[];
  kcalGoal: number | null;
  proteinGoal: number | null;
  sessions: WrapupSession[];
  /** The gym day due next in the Push / Pull / Legs rotation. */
  nextSplit: SplitDay;
  waterMl: number;
  waterGoalMl: number;
  volumeUnit: VolumeUnit;
  weightKg: number | null;
  weightUnit: WeightUnit;
  /** Today only: actions are counted for the current week. */
  levers: (LeverSummary & { goalTitle: string })[];
  /** Today only: active goals whose end date has passed. */
  endedGoals: EndedGoal[];
};

function minutesOf(w: { duration_min: number | null; started_at: string | null; ended_at: string | null }): number | null {
  if (w.duration_min) return w.duration_min;
  if (!w.started_at || !w.ended_at) return null;
  const m = Math.round((Date.parse(w.ended_at) - Date.parse(w.started_at)) / 60_000);
  return m > 0 ? m : null;
}

/** Everything the wrap-up's body and goals step shows, for one day. */
export async function loadWrapupBody(
  supabase: Client,
  ownerId: string,
  date: string,
  todayIso: string,
  weekStart: string
): Promise<WrapupBodyData> {
  const isToday = date === todayIso;
  const [profile, { data: meals }, { data: workouts }, { data: water }, { data: body }, { data: goals }, split] =
    await Promise.all([
      readHealthProfile(supabase, ownerId),
      supabase
        .from("meals")
        .select("id, meal_type, raw_text, created_at, meal_items(kcal, protein_g)")
        .eq("owner_id", ownerId)
        .eq("log_date", date)
        .eq("is_template", false)
        .order("created_at"),
      supabase
        .from("workouts")
        .select("id, name, activity, duration_min, started_at, ended_at, workout_sets(weight_kg, reps, distance_m, duration_sec)")
        .eq("owner_id", ownerId)
        .eq("log_date", date)
        .order("created_at"),
      supabase.from("water_logs").select("amount_ml").eq("owner_id", ownerId).eq("log_date", date),
      supabase.from("body_metrics").select("weight_kg").eq("owner_id", ownerId).eq("measured_on", date).maybeSingle(),
      isToday
        ? supabase.from("goals").select("id, parent_id, title, status, start_date, target_date, extended_at").eq("owner_id", ownerId)
        : Promise.resolve({ data: [] as { id: string; parent_id: string | null; title: string; status: string; start_date: string; target_date: string; extended_at: string | null }[] }),
      loadSplitHistory(supabase, ownerId, date),
    ]);

  const allGoals = goals ?? [];
  const active = allGoals.filter((g) => g.status === "active");
  const titleOf = new Map(allGoals.map((g) => [g.id, g.title]));
  const levers = isToday
    ? await loadLeverSummaries(supabase, ownerId, active.map((g) => g.id), allGoals, todayIso, weekStart)
    : [];

  return {
    meals: (meals ?? []).map((m) => ({
      id: m.id,
      mealType: m.meal_type as MealType,
      said: m.raw_text,
      kcal: Math.round((m.meal_items ?? []).reduce((s, i) => s + Number(i.kcal), 0)),
      protein_g: Math.round((m.meal_items ?? []).reduce((s, i) => s + Number(i.protein_g), 0)),
    })),
    kcalGoal: profile.daily_kcal_goal,
    proteinGoal: profile.daily_protein_g_goal,
    sessions: (workouts ?? []).map((w) => ({
      id: w.id,
      name: w.name ?? "Workout",
      activity: w.activity,
      minutes: minutesOf(w),
      // Rows with nothing in them only hold an exercise's place.
      sets: (w.workout_sets ?? []).filter(
        (s) => s.weight_kg !== null || s.reps !== null || s.distance_m !== null || s.duration_sec !== null
      ).length,
    })),
    nextSplit: nextSplitDay(split.last),
    waterMl: (water ?? []).reduce((s, r) => s + r.amount_ml, 0),
    waterGoalMl: profile.daily_water_ml_goal,
    volumeUnit: profile.volume_unit,
    weightKg: body?.weight_kg != null ? Number(body.weight_kg) : null,
    weightUnit: profile.weight_unit,
    levers: levers.map((l) => ({ ...l, goalTitle: titleOf.get(l.goal_id) ?? "" })),
    endedGoals: active
      .filter((g) => g.target_date < todayIso)
      .sort((a, b) => a.target_date.localeCompare(b.target_date))
      .map((g) => ({ id: g.id, title: g.title, targetDate: g.target_date, canExtend: !g.extended_at })),
  };
}
