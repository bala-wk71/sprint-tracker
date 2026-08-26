/**
 * Pure conversions and derived numbers for the health tab.
 *
 * Everything is stored metric in the database; these functions exist for the
 * display layer and for the aggregates the charts and the AI context need.
 * No Supabase, no React — so they stay trivially testable.
 */

const KG_PER_LB = 0.45359237;
const ML_PER_OZ = 29.5735;

export type WeightUnit = "kg" | "lb";
export type VolumeUnit = "ml" | "oz";

export function kgToDisplay(kg: number, unit: WeightUnit): number {
  return unit === "lb" ? kg / KG_PER_LB : kg;
}

export function displayToKg(value: number, unit: WeightUnit): number {
  return unit === "lb" ? value * KG_PER_LB : value;
}

export function mlToDisplay(ml: number, unit: VolumeUnit): number {
  return unit === "oz" ? ml / ML_PER_OZ : ml;
}

export function displayToMl(value: number, unit: VolumeUnit): number {
  return unit === "oz" ? value * ML_PER_OZ : value;
}

/** e.g. `72.4 kg`, rounded the way each unit is normally read. */
export function formatWeight(kg: number | null, unit: WeightUnit): string {
  if (kg === null) return "—";
  const value = kgToDisplay(kg, unit);
  return `${value.toFixed(1)} ${unit}`;
}

export function formatVolume(ml: number, unit: VolumeUnit): string {
  if (unit === "oz") return `${(ml / ML_PER_OZ).toFixed(0)} oz`;
  return ml >= 1000 ? `${(ml / 1000).toFixed(ml % 1000 === 0 ? 0 : 1)} L` : `${ml} ml`;
}

// ---------------------------------------------------------------------------
// Strength
// ---------------------------------------------------------------------------

/**
 * Estimated one-rep max, Epley. This is what makes sets comparable across
 * different rep ranges — 100kg×5 and 110kg×3 are the same lift by e1RM, and
 * without it a week of heavy triples looks like a regression next to a week of
 * lighter fives.
 *
 * Epley drifts high past ~12 reps, where the formula stops describing a real
 * max, so anything above that returns null rather than a confident wrong
 * number.
 */
export function e1rm(weightKg: number | null, reps: number | null): number | null {
  if (!weightKg || !reps || reps < 1) return null;
  if (reps > 12) return null;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

/** Weight moved by one set. Bodyweight-only sets contribute nothing. */
export function setVolume(weightKg: number | null, reps: number | null): number {
  if (!weightKg || !reps) return 0;
  return weightKg * reps;
}

export type SetLike = {
  weight_kg: number | null;
  reps: number | null;
  is_warmup: boolean;
};

/** Total working volume in kg — warm-ups never count. */
export function totalVolume(sets: SetLike[]): number {
  return sets.reduce(
    (sum, s) => (s.is_warmup ? sum : sum + setVolume(s.weight_kg, s.reps)),
    0
  );
}

/** The working set with the highest e1RM, which is the one worth beating. */
export function bestSet<T extends SetLike>(sets: T[]): T | null {
  let best: T | null = null;
  let bestScore = -1;
  for (const s of sets) {
    if (s.is_warmup) continue;
    const score = e1rm(s.weight_kg, s.reps) ?? 0;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

export type MacroLike = {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
};

export const ZERO_MACROS: MacroLike = {
  kcal: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  fiber_g: 0,
};

export function sumMacros(items: MacroLike[]): MacroLike {
  return items.reduce(
    (acc, i) => ({
      kcal: acc.kcal + i.kcal,
      protein_g: acc.protein_g + i.protein_g,
      carbs_g: acc.carbs_g + i.carbs_g,
      fat_g: acc.fat_g + i.fat_g,
      fiber_g: acc.fiber_g + i.fiber_g,
    }),
    { ...ZERO_MACROS }
  );
}

/** Calories implied by the macros — a sanity check on an AI estimate. */
export function kcalFromMacros(m: Pick<MacroLike, "protein_g" | "carbs_g" | "fat_g">): number {
  return m.protein_g * 4 + m.carbs_g * 4 + m.fat_g * 9;
}

/** Scale a per-serving food to an eaten quantity. */
export function scaleMacros(base: MacroLike, factor: number): MacroLike {
  return {
    kcal: base.kcal * factor,
    protein_g: base.protein_g * factor,
    carbs_g: base.carbs_g * factor,
    fat_g: base.fat_g * factor,
    fiber_g: base.fiber_g * factor,
  };
}

// ---------------------------------------------------------------------------
// Trends
// ---------------------------------------------------------------------------

export type DatedValue = { date: string; value: number };

/**
 * Trailing moving average. Daily weight is mostly water and yesterday's salt;
 * the raw line is noise and the average is the signal, so charts plot both.
 */
export function movingAverage(points: DatedValue[], window: number): DatedValue[] {
  const out: DatedValue[] = [];
  for (let i = 0; i < points.length; i++) {
    const slice = points.slice(Math.max(0, i - window + 1), i + 1);
    const mean = slice.reduce((s, p) => s + p.value, 0) / slice.length;
    out.push({ date: points[i].date, value: mean });
  }
  return out;
}

/**
 * Rate of change in units per week, by least-squares fit over the window.
 *
 * A fit rather than (last - first) / weeks: two noisy endpoints can show a
 * gain across a fortnight that trended down throughout. Needs at least three
 * points spanning more than a day, otherwise there is no trend to report.
 */
export function ratePerWeek(points: DatedValue[]): number | null {
  if (points.length < 3) return null;

  const t0 = Date.parse(`${points[0].date}T00:00:00`);
  const xs = points.map((p) => (Date.parse(`${p.date}T00:00:00`) - t0) / 86_400_000);
  const ys = points.map((p) => p.value);

  const n = xs.length;
  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = ys.reduce((s, y) => s + y, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den === 0) return null;

  return (num / den) * 7;
}

/**
 * Days until `target` at the current rate, or null when the trend is flat or
 * heading the wrong way — in which case an ETA would be fiction.
 */
export function daysToTarget(
  current: number,
  target: number,
  ratePerWeekValue: number | null
): number | null {
  if (ratePerWeekValue === null || ratePerWeekValue === 0) return null;
  const remaining = target - current;
  if (Math.sign(remaining) !== Math.sign(ratePerWeekValue)) return null;
  return Math.round((remaining / ratePerWeekValue) * 7);
}

// ---------------------------------------------------------------------------
// Target suggestions
// ---------------------------------------------------------------------------

/** Mifflin-St Jeor resting burn — the least-wrong of the simple BMR formulas. */
export function bmrMifflinStJeor(
  weightKg: number,
  heightCm: number,
  ageYears: number,
  sex: "male" | "female" | "other"
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  // "other" sits between the two constants rather than picking one.
  const offset = sex === "male" ? 5 : sex === "female" ? -161 : -78;
  return base + offset;
}

/**
 * Starting calorie and protein targets from a user's own numbers.
 *
 * Deliberately a suggestion, not a calculation the app enforces: the activity
 * multiplier is fixed at 1.5 (a desk job plus a few sessions a week) because
 * asking someone to self-rate their activity level produces a worse number
 * than assuming the common case and letting them edit it.
 */
export function suggestDailyTargets(input: {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  sex: "male" | "female" | "other";
  goalType: "cut" | "bulk" | "recomp" | "maintain";
}): { kcal: number; proteinG: number } {
  const tdee = bmrMifflinStJeor(input.weightKg, input.heightCm, input.ageYears, input.sex) * 1.5;

  const kcalFactor =
    input.goalType === "cut" ? 0.8 : input.goalType === "bulk" ? 1.1 : 1;
  // Protein climbs on a cut, where it is what keeps the loss out of muscle.
  const proteinPerKg =
    input.goalType === "cut" ? 2.2 : input.goalType === "maintain" ? 1.6 : 1.8;

  return {
    kcal: Math.round((tdee * kcalFactor) / 10) * 10,
    proteinG: Math.round(input.weightKg * proteinPerKg),
  };
}

export function ageFrom(birthDate: string, todayIso: string): number | null {
  const born = Date.parse(`${birthDate}T00:00:00`);
  const now = Date.parse(`${todayIso}T00:00:00`);
  if (Number.isNaN(born) || Number.isNaN(now) || now < born) return null;
  return Math.floor((now - born) / (365.2425 * 86_400_000));
}

export function pctOfGoal(actual: number, goal: number | null): number | null {
  if (!goal || goal <= 0) return null;
  return Math.round((actual / goal) * 100);
}
