import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { readHealthProfile } from "@/lib/health/profile";
import { e1rm, ratePerWeek, type DatedValue } from "@/lib/health/units";

type Client = SupabaseClient<Database>;

/**
 * The health picture, as plain text for a prompt.
 *
 * Aggregated rather than dumped: a year of sets is tens of thousands of rows
 * and the model needs the shape, not the raw log. What it gets is what a coach
 * would ask for — where the weight is heading, whether the main lifts are
 * moving, and whether the daily targets are actually being hit.
 */

const TRAINING_DAYS = 28;
const LIFT_HISTORY_DAYS = 120;
const NUTRITION_DAYS = 14;

function shiftIso(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function fmt(n: number, digits = 1): string {
  return n.toFixed(digits);
}

export async function gatherHealthContext(
  supabase: Client,
  userId: string,
  todayIso: string
): Promise<string> {
  const trainingFrom = shiftIso(todayIso, -TRAINING_DAYS);
  const liftFrom = shiftIso(todayIso, -LIFT_HISTORY_DAYS);
  const nutritionFrom = shiftIso(todayIso, -NUTRITION_DAYS);

  const [
    profile,
    { data: bodyRows },
    { data: workoutRows },
    { data: setRows },
    { data: mealRows },
    { data: waterRows },
  ] = await Promise.all([
    readHealthProfile(supabase, userId),
    supabase
      .from("body_metrics")
      .select("measured_on, weight_kg, body_fat_pct, muscle_mass_kg")
      .eq("owner_id", userId)
      .gte("measured_on", shiftIso(todayIso, -180))
      .order("measured_on"),
    supabase
      .from("workouts")
      .select("id, log_date, name")
      .eq("owner_id", userId)
      .gte("log_date", trainingFrom)
      .order("log_date", { ascending: false }),
    supabase
      .from("workout_sets")
      .select(
        "weight_kg, reps, is_warmup, exercises!inner(name, muscle_group), workouts!inner(log_date)"
      )
      .eq("owner_id", userId)
      .eq("is_warmup", false)
      .gte("workouts.log_date", liftFrom)
      .limit(4000),
    supabase
      .from("meals")
      .select("log_date, meal_items(kcal, protein_g)")
      .eq("owner_id", userId)
      .eq("is_template", false)
      .gte("log_date", nutritionFrom),
    supabase
      .from("water_logs")
      .select("log_date, amount_ml")
      .eq("owner_id", userId)
      .gte("log_date", nutritionFrom),
  ]);

  const sections: string[] = [];
  const body = bodyRows ?? [];
  const workouts = workoutRows ?? [];

  // Nothing logged at all — say so once rather than emitting five empty
  // headings the model then has to reason around.
  if (
    body.length === 0 &&
    workouts.length === 0 &&
    (mealRows ?? []).length === 0 &&
    (waterRows ?? []).length === 0
  ) {
    return "## Health\nNothing logged in the Health tab yet.";
  }

  sections.push("## Health");

  // ------------------------------------------------------------------ goals
  const goalBits: string[] = [`Goal: ${profile.goal_type}`];
  if (profile.target_weight_kg)
    goalBits.push(`target weight ${fmt(profile.target_weight_kg)}kg`);
  if (profile.daily_kcal_goal)
    goalBits.push(`${profile.daily_kcal_goal} kcal/day`);
  if (profile.daily_protein_g_goal)
    goalBits.push(`${profile.daily_protein_g_goal}g protein/day`);
  goalBits.push(`${profile.daily_water_ml_goal}ml water/day`);
  goalBits.push(`${profile.weekly_workout_goal} workouts/week`);
  sections.push(goalBits.join(", "));

  // ------------------------------------------------------------------- body
  const weightPoints: DatedValue[] = body
    .filter((r) => r.weight_kg !== null)
    .map((r) => ({ date: r.measured_on, value: r.weight_kg as number }));

  if (weightPoints.length > 0) {
    const latest = weightPoints[weightPoints.length - 1];
    sections.push(`\n### Body`);
    sections.push(`Weight: ${fmt(latest.value, 2)}kg on ${latest.date}`);

    for (const days of [7, 30, 90]) {
      const cutoff = shiftIso(todayIso, -days);
      const rate = ratePerWeek(weightPoints.filter((p) => p.date >= cutoff));
      if (rate !== null)
        sections.push(`${days}-day trend: ${rate > 0 ? "+" : ""}${fmt(rate, 2)} kg/week`);
    }

    const fatPoints = body.filter((r) => r.body_fat_pct !== null);
    const musclePoints = body.filter((r) => r.muscle_mass_kg !== null);
    if (fatPoints.length > 1) {
      const first = fatPoints[0];
      const last = fatPoints[fatPoints.length - 1];
      sections.push(
        `Body fat: ${fmt(last.body_fat_pct as number)}% (was ${fmt(first.body_fat_pct as number)}% on ${first.measured_on})`
      );
    }
    if (musclePoints.length > 1) {
      const first = musclePoints[0];
      const last = musclePoints[musclePoints.length - 1];
      sections.push(
        `Muscle mass: ${fmt(last.muscle_mass_kg as number)}kg (was ${fmt(first.muscle_mass_kg as number)}kg on ${first.measured_on})`
      );
    }
    sections.push(
      `Weigh-ins logged in the last 30 days: ${weightPoints.filter((p) => p.date >= shiftIso(todayIso, -30)).length}`
    );
  }

  // --------------------------------------------------------------- training
  type SetRow = {
    weight_kg: number | null;
    reps: number | null;
    exercises: { name: string; muscle_group: string } | { name: string; muscle_group: string }[] | null;
    workouts: { log_date: string } | { log_date: string }[] | null;
  };

  const sets = ((setRows ?? []) as SetRow[]).flatMap((row) => {
    const exercise = Array.isArray(row.exercises) ? row.exercises[0] : row.exercises;
    const workout = Array.isArray(row.workouts) ? row.workouts[0] : row.workouts;
    if (!exercise || !workout) return [];
    return [
      {
        name: exercise.name,
        muscleGroup: exercise.muscle_group,
        date: workout.log_date,
        weightKg: row.weight_kg,
        reps: row.reps,
      },
    ];
  });

  if (workouts.length > 0 || sets.length > 0) {
    sections.push(`\n### Training (last ${TRAINING_DAYS} days)`);
    sections.push(`Sessions: ${workouts.length}`);

    const recentSets = sets.filter((s) => s.date >= trainingFrom);
    const volume = recentSets.reduce(
      (sum, s) => sum + (s.weightKg ?? 0) * (s.reps ?? 0),
      0
    );
    sections.push(
      `Working sets: ${recentSets.length}, total volume ${Math.round(volume).toLocaleString()}kg`
    );

    const byGroup = new Map<string, number>();
    for (const s of recentSets)
      byGroup.set(s.muscleGroup, (byGroup.get(s.muscleGroup) ?? 0) + 1);
    if (byGroup.size > 0) {
      const ranked = [...byGroup.entries()].sort((a, b) => b[1] - a[1]);
      sections.push(
        `Sets per muscle group: ${ranked.map(([g, n]) => `${g} ${n}`).join(", ")}`
      );
    }

    // The lifts that actually carry the programme, and whether their estimated
    // 1RM has moved — the single number that says training is working.
    const byExercise = new Map<
      string,
      { date: string; value: number }[]
    >();
    for (const s of sets) {
      const value = e1rm(s.weightKg, s.reps);
      if (value === null) continue;
      const list = byExercise.get(s.name) ?? [];
      list.push({ date: s.date, value });
      byExercise.set(s.name, list);
    }

    const progress = [...byExercise.entries()]
      .map(([name, points]) => {
        const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
        const dates = [...new Set(sorted.map((p) => p.date))];
        const bestOn = (date: string) =>
          Math.max(...sorted.filter((p) => p.date === date).map((p) => p.value));
        return {
          name,
          sessions: dates.length,
          firstDate: dates[0],
          first: bestOn(dates[0]),
          lastDate: dates[dates.length - 1],
          last: bestOn(dates[dates.length - 1]),
          best: Math.max(...sorted.map((p) => p.value)),
        };
      })
      .filter((p) => p.sessions >= 2)
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 8);

    if (progress.length > 0) {
      sections.push(
        `\nMain lifts, estimated 1RM over the last ${LIFT_HISTORY_DAYS} days:`
      );
      for (const p of progress) {
        const delta = p.last - p.first;
        sections.push(
          `- ${p.name}: ${fmt(p.first)}kg (${p.firstDate}) → ${fmt(p.last)}kg (${p.lastDate}), ${delta >= 0 ? "+" : ""}${fmt(delta)}kg over ${p.sessions} sessions, best ${fmt(p.best)}kg`
        );
      }
    }

    const untouched = sets.length > 0 ? lastTrainedPerGroup(sets, todayIso) : [];
    if (untouched.length > 0)
      sections.push(`\nNot trained recently: ${untouched.join(", ")}`);
  }

  // -------------------------------------------------------------- nutrition
  type MealRow = {
    log_date: string | null;
    meal_items: { kcal: number; protein_g: number }[] | null;
  };

  const perDay = new Map<string, { kcal: number; protein: number }>();
  for (const meal of (mealRows ?? []) as MealRow[]) {
    if (!meal.log_date) continue;
    const day = perDay.get(meal.log_date) ?? { kcal: 0, protein: 0 };
    for (const item of meal.meal_items ?? []) {
      day.kcal += Number(item.kcal);
      day.protein += Number(item.protein_g);
    }
    perDay.set(meal.log_date, day);
  }

  if (perDay.size > 0) {
    sections.push(`\n### Food (last ${NUTRITION_DAYS} days)`);
    sections.push(`Days logged: ${perDay.size} of ${NUTRITION_DAYS}`);

    const days = [...perDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const avgKcal =
      days.reduce((s, [, d]) => s + d.kcal, 0) / days.length;
    const avgProtein =
      days.reduce((s, [, d]) => s + d.protein, 0) / days.length;
    sections.push(
      `Average: ${Math.round(avgKcal)} kcal, ${Math.round(avgProtein)}g protein per logged day`
    );

    if (profile.daily_protein_g_goal) {
      const hit = days.filter(
        ([, d]) => d.protein >= (profile.daily_protein_g_goal as number)
      ).length;
      sections.push(
        `Protein goal hit on ${hit} of ${days.length} logged days`
      );
    }
    if (profile.daily_kcal_goal) {
      const over = days.filter(
        ([, d]) => d.kcal > (profile.daily_kcal_goal as number)
      ).length;
      sections.push(`Over the calorie goal on ${over} of ${days.length} logged days`);
    }

    sections.push(
      `Per day: ${days.map(([date, d]) => `${date} ${Math.round(d.kcal)}kcal/${Math.round(d.protein)}p`).join("; ")}`
    );
    sections.push(
      `Note: days with nothing logged are days the user did not record food, not days they did not eat.`
    );
  }

  // ------------------------------------------------------------------ water
  const waterPerDay = new Map<string, number>();
  for (const row of waterRows ?? [])
    waterPerDay.set(
      row.log_date,
      (waterPerDay.get(row.log_date) ?? 0) + row.amount_ml
    );

  if (waterPerDay.size > 0) {
    const days = [...waterPerDay.values()];
    const hit = days.filter((ml) => ml >= profile.daily_water_ml_goal).length;
    sections.push(`\n### Water (last ${NUTRITION_DAYS} days)`);
    sections.push(
      `Logged on ${days.length} days, average ${Math.round(days.reduce((a, b) => a + b, 0) / days.length)}ml, goal hit on ${hit}`
    );
  }

  return sections.join("\n");
}

/** Muscle groups trained at some point but not in the last two weeks. */
function lastTrainedPerGroup(
  sets: { muscleGroup: string; date: string }[],
  todayIso: string
): string[] {
  const cutoff = shiftIso(todayIso, -14);
  const latest = new Map<string, string>();
  for (const s of sets) {
    const current = latest.get(s.muscleGroup);
    if (!current || s.date > current) latest.set(s.muscleGroup, s.date);
  }
  return [...latest.entries()]
    .filter(([group, date]) => date < cutoff && group !== "cardio")
    .map(([group, date]) => `${group} (last ${date})`);
}
