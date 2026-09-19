// Options for planning a goal: where a measure's numbers come from, its
// units, levers, and the cascade levels. Client-safe.

import type { Cadence, Direction, Interpolate } from "./projection";

export type MeasureSource =
  | "manual"
  | "body.weight_kg"
  | "body.waist_cm"
  | "body.body_fat_pct"
  | "body.muscle_mass_kg"
  | "body.skeletal_muscle_pct"
  | "loan_schedule";

/** Auto sources read the Health tab's body log, so logging there moves the goal. */
export const MEASURE_SOURCES: {
  value: MeasureSource;
  label: string;
  hint: string;
  unit: string;
  direction: Direction;
  cadence: Cadence;
}[] = [
  { value: "manual", label: "I'll enter it", hint: "Type a value whenever you check.", unit: "", direction: "up", cadence: "monthly" },
  { value: "body.weight_kg", label: "Weight (Health)", hint: "From your weigh-ins, on a 7-day average.", unit: "kg", direction: "down", cadence: "weekly" },
  { value: "body.waist_cm", label: "Waist (Health)", hint: "From body measurements.", unit: "cm", direction: "down", cadence: "monthly" },
  { value: "body.body_fat_pct", label: "Body fat (Health)", hint: "From your scale readings.", unit: "%", direction: "down", cadence: "monthly" },
  { value: "body.muscle_mass_kg", label: "Muscle mass (Health)", hint: "From your scale readings.", unit: "kg", direction: "up", cadence: "monthly" },
  { value: "body.skeletal_muscle_pct", label: "Skeletal muscle (Health)", hint: "From your scale readings.", unit: "%", direction: "up", cadence: "monthly" },
  { value: "loan_schedule", label: "Loan balance (EMI schedule)", hint: "Worked out from the EMI and the last EMI date. A typed balance overrides it.", unit: "inr", direction: "down", cadence: "monthly" },
];

export const BODY_COLUMNS = {
  "body.weight_kg": "weight_kg",
  "body.waist_cm": "waist_cm",
  "body.body_fat_pct": "body_fat_pct",
  "body.muscle_mass_kg": "muscle_mass_kg",
  "body.skeletal_muscle_pct": "skeletal_muscle_pct",
} as const;

export type BodySource = keyof typeof BODY_COLUMNS;

export function isBodySource(source: string): source is BodySource {
  return source in BODY_COLUMNS;
}

export function measureSource(value: string) {
  return MEASURE_SOURCES.find((s) => s.value === value) ?? MEASURE_SOURCES[0];
}

export const UNIT_OPTIONS = [
  { value: "kg", label: "kg" },
  { value: "cm", label: "cm" },
  { value: "%", label: "%" },
  { value: "inr", label: "₹" },
  { value: "hours", label: "hours" },
  { value: "level", label: "level (L1, L2…)" },
] as const;

export const DIRECTIONS: { value: Direction; label: string; hint: string }[] = [
  { value: "down", label: "Lower is better", hint: "Weight, waist, debt" },
  { value: "up", label: "Higher is better", hint: "Profit, savings, muscle, skill level" },
  { value: "band", label: "Stay in a range", hint: "Calories, sleep" },
];

export const INTERPOLATIONS: { value: Interpolate; label: string; hint: string }[] = [
  { value: "linear", label: "Steady", hint: "The same amount every week." },
  { value: "compound", label: "Compounding", hint: "Grows by a percentage, like profit at 40% a year." },
  { value: "step", label: "In steps", hint: "Jumps on each date, like skill levels." },
];

export const CADENCES: { value: Cadence; label: string }[] = [
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
  { value: "quarterly", label: "Every quarter" },
];

export type MeasureKind = "number" | "ladder";

export type LadderLevel = { level: number; title: string; proof: string };

export type LeverSource = "tick" | "workouts" | "linked_hours";

export const LEVER_SOURCES: { value: LeverSource; label: string; hint: string }[] = [
  { value: "tick", label: "I tick it off", hint: "One tap each time you do it." },
  { value: "workouts", label: "Workouts (Health)", hint: "Counts sessions logged in Health." },
  { value: "linked_hours", label: "Hours on linked work", hint: "Time logged on sprint tasks linked to this goal or the goals under it." },
];

export type GoalLevel = "destination" | "year" | "quarter" | "project";

export const GOAL_LEVELS: { value: GoalLevel; label: string }[] = [
  { value: "destination", label: "Destination" },
  { value: "year", label: "Year" },
  { value: "quarter", label: "Quarter" },
  { value: "project", label: "Project" },
];

export function goalLevelLabel(level: string | null | undefined) {
  return GOAL_LEVELS.find((l) => l.value === level)?.label ?? null;
}

/** Status words. The UI never says "behind". */
export const STATUS_COPY = {
  ahead: { label: "Ahead", tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  on_track: { label: "On track", tone: "bg-primary/10 text-primary" },
  catching_up: { label: "Catching up", tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  off_band: { label: "Outside the range", tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  needs_reading: { label: "Needs a reading", tone: "bg-muted text-muted-foreground" },
  no_plan: { label: "No path yet", tone: "bg-muted text-muted-foreground" },
} as const;

export type SummaryStatus = keyof typeof STATUS_COPY;
