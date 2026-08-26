import {
  detectDayFirst,
  distanceToMetres,
  durationToSeconds,
  num,
  parseCsvObjects,
  toIsoDate,
} from "./csv";

/**
 * FitNotes' export, whose columns are fixed and documented:
 *
 *   Date, Exercise, Category, Weight (kg), Weight (lbs), Reps,
 *   Distance, Distance Unit, Time, Notes, Kind
 *
 * Rows are already grouped by date and by exercise within a date, so one
 * workout per date and sets in file order reproduces the original sessions.
 */

const LB_TO_KG = 0.45359237;

export type ParsedSet = {
  exerciseName: string;
  category: string;
  kind: string;
  weightKg: number | null;
  reps: number | null;
  distanceM: number | null;
  durationSec: number | null;
  notes: string | null;
};

export type ParsedWorkout = {
  logDate: string;
  sets: ParsedSet[];
};

export type FitnotesParse = {
  workouts: ParsedWorkout[];
  /** Every distinct exercise seen, with the category FitNotes filed it under. */
  exercises: { name: string; category: string; kind: string }[];
  setCount: number;
  skippedRows: number;
  dateRange: { from: string; to: string } | null;
  warnings: string[];
};

function pick(row: Record<string, string>, ...names: string[]): string {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== "") return value;
  }
  return "";
}

/** Which fields a set records, inferred when the Kind column is missing. */
function inferKind(set: Omit<ParsedSet, "kind" | "exerciseName" | "category">): string {
  let kind = "";
  if (set.weightKg !== null) kind += "w";
  if (set.reps !== null) kind += "r";
  if (set.distanceM !== null) kind += "d";
  if (set.durationSec !== null) kind += "t";
  return kind || "wr";
}

export function parseFitnotesCsv(text: string): FitnotesParse {
  const { headers, rows } = parseCsvObjects(text);
  const warnings: string[] = [];

  if (!headers.some((h) => /^date$/i.test(h)))
    warnings.push("No Date column found — is this a FitNotes export?");
  if (!headers.some((h) => /^exercise$/i.test(h)))
    warnings.push("No Exercise column found — is this a FitNotes export?");

  const dayFirst = detectDayFirst(rows.map((r) => pick(r, "Date", "date")));

  const byDate = new Map<string, ParsedSet[]>();
  const exercises = new Map<string, { name: string; category: string; kind: string }>();
  let skippedRows = 0;

  for (const row of rows) {
    const logDate = toIsoDate(pick(row, "Date", "date"), dayFirst);
    const exerciseName = pick(row, "Exercise", "exercise").trim();

    if (!logDate || !exerciseName) {
      skippedRows++;
      continue;
    }

    // FitNotes writes both weight columns and fills whichever matches the
    // user's unit, so kg wins and lbs is the fallback rather than a second
    // reading of the same set.
    const kg = num(pick(row, "Weight (kg)", "Weight(kg)", "weight_kg"));
    const lbs = num(pick(row, "Weight (lbs)", "Weight(lbs)", "weight_lbs"));
    const weightKg = kg !== null ? kg : lbs !== null ? lbs * LB_TO_KG : null;

    const fields = {
      weightKg,
      reps: num(pick(row, "Reps", "reps")),
      distanceM: distanceToMetres(
        pick(row, "Distance", "distance"),
        pick(row, "Distance Unit", "distance_unit")
      ),
      durationSec: durationToSeconds(pick(row, "Time", "time")),
      notes: pick(row, "Notes", "notes") || null,
    };

    // A row with no measurement at all is a blank line in the export, not a set.
    if (
      fields.weightKg === null &&
      fields.reps === null &&
      fields.distanceM === null &&
      fields.durationSec === null
    ) {
      skippedRows++;
      continue;
    }

    const category = pick(row, "Category", "category").trim() || "other";
    const declaredKind = pick(row, "Kind", "kind").trim().toLowerCase();
    const kind = /^[wrdt]{1,4}$/.test(declaredKind)
      ? declaredKind
      : inferKind(fields);

    const set: ParsedSet = { exerciseName, category, kind, ...fields };

    const list = byDate.get(logDate) ?? [];
    list.push(set);
    byDate.set(logDate, list);

    const key = exerciseName.toLowerCase();
    if (!exercises.has(key))
      exercises.set(key, { name: exerciseName, category, kind });
  }

  const dates = [...byDate.keys()].sort();
  const workouts: ParsedWorkout[] = dates.map((logDate) => ({
    logDate,
    sets: byDate.get(logDate) ?? [],
  }));

  if (skippedRows > 0)
    warnings.push(
      `${skippedRows} row${skippedRows === 1 ? "" : "s"} had no usable date, exercise or measurement and will be ignored.`
    );

  return {
    workouts,
    exercises: [...exercises.values()],
    setCount: workouts.reduce((s, w) => s + w.sets.length, 0),
    skippedRows,
    dateRange:
      dates.length > 0 ? { from: dates[0], to: dates[dates.length - 1] } : null,
    warnings,
  };
}
