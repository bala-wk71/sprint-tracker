/** Shared vocabulary for the health tab — kept in sync with the CHECK
 *  constraints in supabase/migrations/20260826000001_health.sql. */

export const MUSCLE_GROUPS = [
  "chest",
  "back",
  "shoulders",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "biceps",
  "triceps",
  "forearms",
  "abs",
  "full body",
  "cardio",
  "mobility",
  "other",
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const EQUIPMENT = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "bodyweight",
  "kettlebell",
  "band",
  "other",
] as const;

/**
 * Which fields a set records, in FitNotes' own letter notation so its CSV
 * imports without translation: w=weight, r=reps, d=distance, t=time.
 */
export type ExerciseKind = string;

export function kindHas(kind: ExerciseKind, field: "w" | "r" | "d" | "t"): boolean {
  return kind.includes(field);
}

export const MEAL_TYPES = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
] as const;

export type MealType = (typeof MEAL_TYPES)[number]["value"];

/**
 * Best guess at which meal is being logged, so the picker starts on the right
 * one and most entries need no choice at all.
 */
export function defaultMealType(hour: number): MealType {
  if (hour < 11) return "breakfast";
  if (hour < 16) return "lunch";
  if (hour < 22) return "dinner";
  return "snack";
}

/** Quick-add sizes, in ml. A glass, a bottle, a large bottle. */
export const WATER_PRESETS = [250, 500, 1000] as const;

export const GOAL_TYPES = [
  { value: "cut", label: "Cut", hint: "Lose fat, keep strength" },
  { value: "bulk", label: "Bulk", hint: "Gain muscle, accept some fat" },
  { value: "recomp", label: "Recomp", hint: "Hold weight, change composition" },
  { value: "maintain", label: "Maintain", hint: "Stay where you are" },
] as const;

export type GoalType = (typeof GOAL_TYPES)[number]["value"];

export type HealthProfile = {
  height_cm: number | null;
  sex: "male" | "female" | "other" | null;
  birth_date: string | null;
  goal_type: GoalType;
  target_weight_kg: number | null;
  daily_water_ml_goal: number;
  daily_kcal_goal: number | null;
  daily_protein_g_goal: number | null;
  weekly_workout_goal: number;
  weight_unit: "kg" | "lb";
  volume_unit: "ml" | "oz";
};

/** Defaults for a user who has not filled in the goals form yet. */
export const DEFAULT_HEALTH_PROFILE: HealthProfile = {
  height_cm: null,
  sex: null,
  birth_date: null,
  goal_type: "maintain",
  target_weight_kg: null,
  daily_water_ml_goal: 3000,
  daily_kcal_goal: null,
  daily_protein_g_goal: null,
  weekly_workout_goal: 4,
  weight_unit: "kg",
  volume_unit: "ml",
};

export const HEALTH_TABS = [
  { href: "/health", label: "Overview", exact: true },
  { href: "/health/train", label: "Train", exact: false },
  { href: "/health/eat", label: "Eat", exact: false },
  { href: "/health/body", label: "Body", exact: false },
] as const;
