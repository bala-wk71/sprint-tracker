"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { awardXp } from "@/lib/gamification";

// No revalidatePath on the set-level mutations: the session keeps an optimistic
// client copy (see store.tsx), and revalidating from a Server Action ships a
// fresh RSC payload that re-renders the whole page after every typed digit.
// /health/train is a dynamic route reading Supabase directly, so navigating
// back to it still renders fresh data.

export type ActionResult<T = undefined> =
  | ({ ok: true; xp?: number } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");
const uuid = z.string().uuid();

async function getUserOrFail() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function startWorkout(
  input: { logDate: string; name?: string | null }
): Promise<ActionResult<{ id: string }>> {
  const parsed = z
    .object({ logDate: isoDate, name: z.string().trim().max(80).nullable().optional() })
    .safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { data, error } = await ctx.supabase
    .from("workouts")
    .insert({
      owner_id: ctx.user.id,
      log_date: parsed.data.logDate,
      name: parsed.data.name ?? null,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/health/train");
  return { ok: true, data: { id: data.id } };
}

/**
 * Clone the most recent session's exercises into a new one — same movements,
 * no sets. The single most common workout is the last workout, and rebuilding
 * it exercise by exercise is the friction that stops people logging at all.
 */
export async function repeatLastWorkout(
  logDate: string
): Promise<ActionResult<{ id: string; copied: number }>> {
  const parsed = isoDate.safeParse(logDate);
  if (!parsed.success) return { ok: false, error: "Invalid date" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { data: previous } = await ctx.supabase
    .from("workouts")
    .select("id, name, log_date")
    .eq("owner_id", ctx.user.id)
    .lt("log_date", parsed.data)
    .order("log_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!previous)
    return { ok: false, error: "No earlier workout to repeat." };

  const { data: sets } = await ctx.supabase
    .from("workout_sets")
    .select("exercise_id, position")
    .eq("workout_id", previous.id)
    .order("position");

  const created = await startWorkout({
    logDate: parsed.data,
    name: previous.name,
  });
  if (!created.ok) return created;

  // Exercises in the order they were trained, each appearing once.
  const seen = new Set<string>();
  const exerciseIds: string[] = [];
  for (const s of sets ?? []) {
    if (seen.has(s.exercise_id)) continue;
    seen.add(s.exercise_id);
    exerciseIds.push(s.exercise_id);
  }

  // An exercise with no sets has nowhere to live in workout_sets, so each one
  // is seeded with a single empty set that acts as its first row.
  if (exerciseIds.length > 0) {
    const { error } = await ctx.supabase.from("workout_sets").insert(
      exerciseIds.map((exerciseId, i) => ({
        owner_id: ctx.user.id,
        workout_id: created.data.id,
        exercise_id: exerciseId,
        position: i,
      }))
    );
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/health/train");
  return { ok: true, data: { id: created.data.id, copied: exerciseIds.length } };
}

const finishSchema = z.object({
  workoutId: uuid,
  rpe: z.number().int().min(1).max(10).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export async function finishWorkout(
  input: z.infer<typeof finishSchema>
): Promise<ActionResult> {
  const parsed = finishSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { data: workout, error } = await ctx.supabase
    .from("workouts")
    .update({
      ended_at: new Date().toISOString(),
      ...(parsed.data.rpe !== undefined && { rpe: parsed.data.rpe }),
      ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
    })
    .eq("id", parsed.data.workoutId)
    .eq("owner_id", ctx.user.id)
    .select("id, log_date")
    .single();

  if (error) return { ok: false, error: error.message };

  // Keyed on the workout, not the day: two sessions in one day both count,
  // and finishing the same one twice does not.
  const xp = await awardXp(
    ctx.supabase,
    ctx.user.id,
    "workout_logged",
    workout.id
  );

  revalidatePath("/health/train");
  revalidatePath("/health");
  return { ok: true, xp };
}

export async function renameWorkout(input: {
  workoutId: string;
  name: string | null;
}): Promise<ActionResult> {
  const parsed = z
    .object({ workoutId: uuid, name: z.string().trim().max(80).nullable() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { error } = await ctx.supabase
    .from("workouts")
    .update({ name: parsed.data.name || null })
    .eq("id", parsed.data.workoutId)
    .eq("owner_id", ctx.user.id);

  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteWorkout(workoutId: string): Promise<ActionResult> {
  const parsed = uuid.safeParse(workoutId);
  if (!parsed.success) return { ok: false, error: "Invalid workout" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { error } = await ctx.supabase
    .from("workouts")
    .delete()
    .eq("id", parsed.data)
    .eq("owner_id", ctx.user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/health/train");
  revalidatePath("/health");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Sets
// ---------------------------------------------------------------------------

const setFieldsSchema = z.object({
  weightKg: z.number().min(0).max(1000).nullable().optional(),
  reps: z.number().int().min(0).max(1000).nullable().optional(),
  distanceM: z.number().min(0).max(1_000_000).nullable().optional(),
  durationSec: z.number().int().min(0).max(86_400).nullable().optional(),
  isWarmup: z.boolean().optional(),
  rpe: z.number().int().min(1).max(10).nullable().optional(),
  notes: z.string().max(300).nullable().optional(),
});

const addSetSchema = setFieldsSchema.extend({
  workoutId: uuid,
  exerciseId: uuid,
  position: z.number().int().min(0),
});

export async function addSet(
  input: z.infer<typeof addSetSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = addSetSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const f = parsed.data;
  const { data, error } = await ctx.supabase
    .from("workout_sets")
    .insert({
      owner_id: ctx.user.id,
      workout_id: f.workoutId,
      exercise_id: f.exerciseId,
      position: f.position,
      weight_kg: f.weightKg ?? null,
      reps: f.reps ?? null,
      distance_m: f.distanceM ?? null,
      duration_sec: f.durationSec ?? null,
      is_warmup: f.isWarmup ?? false,
      rpe: f.rpe ?? null,
      notes: f.notes ?? null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: data.id } };
}

const updateSetSchema = setFieldsSchema.extend({ setId: uuid });

export async function updateSet(
  input: z.infer<typeof updateSetSchema>
): Promise<ActionResult> {
  const parsed = updateSetSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const f = parsed.data;
  const { error } = await ctx.supabase
    .from("workout_sets")
    .update({
      ...(f.weightKg !== undefined && { weight_kg: f.weightKg }),
      ...(f.reps !== undefined && { reps: f.reps }),
      ...(f.distanceM !== undefined && { distance_m: f.distanceM }),
      ...(f.durationSec !== undefined && { duration_sec: f.durationSec }),
      ...(f.isWarmup !== undefined && { is_warmup: f.isWarmup }),
      ...(f.rpe !== undefined && { rpe: f.rpe }),
      ...(f.notes !== undefined && { notes: f.notes }),
    })
    .eq("id", f.setId)
    .eq("owner_id", ctx.user.id);

  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteSet(setId: string): Promise<ActionResult> {
  const parsed = uuid.safeParse(setId);
  if (!parsed.success) return { ok: false, error: "Invalid set" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { error } = await ctx.supabase
    .from("workout_sets")
    .delete()
    .eq("id", parsed.data)
    .eq("owner_id", ctx.user.id);

  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Remove an exercise from a session — every set of it goes with it. */
export async function removeExercise(input: {
  workoutId: string;
  exerciseId: string;
}): Promise<ActionResult> {
  const parsed = z
    .object({ workoutId: uuid, exerciseId: uuid })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { error } = await ctx.supabase
    .from("workout_sets")
    .delete()
    .eq("workout_id", parsed.data.workoutId)
    .eq("exercise_id", parsed.data.exerciseId)
    .eq("owner_id", ctx.user.id);

  return error ? { ok: false, error: error.message } : { ok: true };
}

// ---------------------------------------------------------------------------
// Exercise library
// ---------------------------------------------------------------------------

const createExerciseSchema = z.object({
  name: z.string().trim().min(1).max(80),
  muscleGroup: z.string().trim().min(1).max(40),
  equipment: z.string().trim().min(1).max(40),
  kind: z.string().regex(/^[wrdt]{1,4}$/),
});

export async function createExercise(
  input: z.infer<typeof createExerciseSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = createExerciseSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { data, error } = await ctx.supabase
    .from("exercises")
    .insert({
      owner_id: ctx.user.id,
      name: parsed.data.name,
      muscle_group: parsed.data.muscleGroup,
      equipment: parsed.data.equipment,
      kind: parsed.data.kind,
    })
    .select("id")
    .single();

  if (error) {
    // The partial unique index on (owner_id, lower(name)).
    if (error.code === "23505")
      return { ok: false, error: "You already have an exercise with that name." };
    return { ok: false, error: error.message };
  }

  revalidatePath("/health/train");
  return { ok: true, data: { id: data.id } };
}
