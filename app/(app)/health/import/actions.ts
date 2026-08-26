"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { parseFitnotesCsv } from "@/lib/health/fitnotesCsv";
import { parseFitdaysCsv, type ColumnMapping } from "@/lib/health/fitdaysCsv";
import { MAX_CSV_BYTES } from "@/lib/health/constants";

type Client = SupabaseClient<Database>;

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

const csvSchema = z.string().min(10).max(MAX_CSV_BYTES);

async function getUserOrFail() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

// ---------------------------------------------------------------------------
// FitNotes — workouts
// ---------------------------------------------------------------------------

export type FitnotesPreview = {
  workoutCount: number;
  setCount: number;
  exerciseCount: number;
  newExerciseNames: string[];
  alreadyImportedDates: number;
  dateRange: { from: string; to: string } | null;
  warnings: string[];
};

/** Every exercise this user can log against, keyed by lowercased name. */
async function loadExerciseIndex(
  supabase: Client,
  userId: string
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("exercises")
    .select("id, name, owner_id")
    .or(`owner_id.is.null,owner_id.eq.${userId}`);

  const index = new Map<string, string>();
  for (const row of data ?? []) {
    const key = row.name.toLowerCase();
    // A user's own exercise shadows a built-in of the same name.
    if (row.owner_id !== null || !index.has(key)) index.set(key, row.id);
  }
  return index;
}

export async function previewFitnotes(
  text: string
): Promise<ActionResult<FitnotesPreview>> {
  const parsed = csvSchema.safeParse(text);
  if (!parsed.success) return { ok: false, error: "That file looks empty." };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const result = parseFitnotesCsv(parsed.data);
  const index = await loadExerciseIndex(ctx.supabase, ctx.user.id);

  const newExerciseNames = result.exercises
    .filter((e) => !index.has(e.name.toLowerCase()))
    .map((e) => e.name);

  const dates = result.workouts.map((w) => w.logDate);
  const { data: existing } = await ctx.supabase
    .from("workouts")
    .select("log_date")
    .eq("owner_id", ctx.user.id)
    .in("log_date", dates.slice(0, 1000));

  const existingDates = new Set((existing ?? []).map((w) => w.log_date));

  return {
    ok: true,
    data: {
      workoutCount: result.workouts.length,
      setCount: result.setCount,
      exerciseCount: result.exercises.length,
      newExerciseNames,
      alreadyImportedDates: dates.filter((d) => existingDates.has(d)).length,
      dateRange: result.dateRange,
      warnings: result.warnings,
    },
  };
}

export type FitnotesImportResult = {
  workoutsCreated: number;
  setsCreated: number;
  exercisesCreated: number;
  datesSkipped: number;
};

export async function importFitnotes(
  text: string
): Promise<ActionResult<FitnotesImportResult>> {
  const parsed = csvSchema.safeParse(text);
  if (!parsed.success) return { ok: false, error: "That file looks empty." };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const result = parseFitnotesCsv(parsed.data);
  if (result.workouts.length === 0)
    return { ok: false, error: "No workouts found in that file." };

  const index = await loadExerciseIndex(ctx.supabase, ctx.user.id);

  // Create the exercises the catalogue does not already cover, using the
  // category FitNotes filed each one under as its muscle group.
  const missing = result.exercises.filter(
    (e) => !index.has(e.name.toLowerCase())
  );
  let exercisesCreated = 0;

  if (missing.length > 0) {
    const { data: created, error } = await ctx.supabase
      .from("exercises")
      .insert(
        missing.map((e) => ({
          owner_id: ctx.user.id,
          name: e.name,
          muscle_group: e.category.toLowerCase() || "other",
          equipment: "other",
          kind: e.kind,
        }))
      )
      .select("id, name");

    if (error) return { ok: false, error: error.message };

    for (const row of created ?? []) index.set(row.name.toLowerCase(), row.id);
    exercisesCreated = (created ?? []).length;
  }

  // A date that already has a workout is left alone rather than merged, which
  // is what makes re-importing the same export a no-op instead of a duplicate.
  const { data: existing } = await ctx.supabase
    .from("workouts")
    .select("log_date")
    .eq("owner_id", ctx.user.id);
  const existingDates = new Set((existing ?? []).map((w) => w.log_date));

  const toImport = result.workouts.filter(
    (w) => !existingDates.has(w.logDate)
  );
  const datesSkipped = result.workouts.length - toImport.length;

  if (toImport.length === 0)
    return {
      ok: true,
      data: {
        workoutsCreated: 0,
        setsCreated: 0,
        exercisesCreated,
        datesSkipped,
      },
    };

  const { data: workouts, error: workoutError } = await ctx.supabase
    .from("workouts")
    .insert(
      toImport.map((w) => ({
        owner_id: ctx.user.id,
        log_date: w.logDate,
        name: "Imported",
        // The export records no start or end time, and inventing one would put
        // a fabricated duration on every historical session.
        started_at: null,
        ended_at: null,
      }))
    )
    .select("id, log_date");

  if (workoutError) return { ok: false, error: workoutError.message };

  const workoutIdByDate = new Map(
    (workouts ?? []).map((w) => [w.log_date, w.id])
  );

  const setRows = toImport.flatMap((workout) => {
    const workoutId = workoutIdByDate.get(workout.logDate);
    if (!workoutId) return [];
    return workout.sets.flatMap((set, position) => {
      const exerciseId = index.get(set.exerciseName.toLowerCase());
      if (!exerciseId) return [];
      return [
        {
          owner_id: ctx.user.id,
          workout_id: workoutId,
          exercise_id: exerciseId,
          position,
          weight_kg: set.weightKg,
          reps: set.reps,
          distance_m: set.distanceM,
          duration_sec: set.durationSec,
          is_warmup: false,
          notes: set.notes,
        },
      ];
    });
  });

  // Chunked: a multi-year export is tens of thousands of rows, and one insert
  // that size times out.
  const CHUNK = 500;
  for (let i = 0; i < setRows.length; i += CHUNK) {
    const { error } = await ctx.supabase
      .from("workout_sets")
      .insert(setRows.slice(i, i + CHUNK));
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/health/train");
  revalidatePath("/health");

  return {
    ok: true,
    data: {
      workoutsCreated: workouts?.length ?? 0,
      setsCreated: setRows.length,
      exercisesCreated,
      datesSkipped,
    },
  };
}

// ---------------------------------------------------------------------------
// FitDays — body composition
// ---------------------------------------------------------------------------

export type FitdaysPreview = {
  dateHeader: string | null;
  mapping: ColumnMapping[];
  unmatchedHeaders: string[];
  rowCount: number;
  existingDates: number;
  dateRange: { from: string; to: string } | null;
  sample: { measuredOn: string; values: Record<string, number> }[];
  warnings: string[];
};

export async function previewFitdays(
  text: string
): Promise<ActionResult<FitdaysPreview>> {
  const parsed = csvSchema.safeParse(text);
  if (!parsed.success) return { ok: false, error: "That file looks empty." };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const result = parseFitdaysCsv(parsed.data);

  const { data: existing } = await ctx.supabase
    .from("body_metrics")
    .select("measured_on")
    .eq("owner_id", ctx.user.id)
    .in(
      "measured_on",
      result.rows.map((r) => r.measuredOn).slice(0, 1000)
    );

  const existingDates = new Set((existing ?? []).map((r) => r.measured_on));

  return {
    ok: true,
    data: {
      dateHeader: result.dateHeader,
      mapping: result.mapping,
      unmatchedHeaders: result.unmatchedHeaders,
      rowCount: result.rows.length,
      existingDates: result.rows.filter((r) => existingDates.has(r.measuredOn))
        .length,
      dateRange: result.dateRange,
      sample: result.rows.slice(-3).map((r) => ({
        measuredOn: r.measuredOn,
        values: r.values as Record<string, number>,
      })),
      warnings: result.warnings,
    },
  };
}

export async function importFitdays(
  text: string
): Promise<ActionResult<{ rowsWritten: number }>> {
  const parsed = csvSchema.safeParse(text);
  if (!parsed.success) return { ok: false, error: "That file looks empty." };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const result = parseFitdaysCsv(parsed.data);
  if (result.rows.length === 0)
    return { ok: false, error: "No readings found in that file." };

  const rows = result.rows.map((row) => ({
    owner_id: ctx.user.id,
    measured_on: row.measuredOn,
    source: "import" as const,
    ...row.values,
  }));

  // Upsert on (owner, date): re-importing an overlapping export corrects the
  // readings for those days rather than failing or duplicating them.
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await ctx.supabase
      .from("body_metrics")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "owner_id,measured_on" });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/health/body");
  revalidatePath("/health");

  return { ok: true, data: { rowsWritten: rows.length } };
}
