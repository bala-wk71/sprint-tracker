"use server";

// The evening wrap-up's body and goals step: the whole day's food in one box,
// a one-tap session, and the goals that ran past their end date. Each piece
// saves on its own, so a half-finished wrap-up still keeps what was entered.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addDays, format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { generateJson } from "@/lib/ai/gemini";
import {
  DAY_PARSE_RESPONSE_SCHEMA,
  dayParseResultSchema,
  getDayParsePrompt,
  type ParsedDayMeal,
} from "@/lib/ai/health";
import { awardXp } from "@/lib/gamification";
import { todayIsoLocal } from "@/lib/dates";
import { saveMeal } from "@/app/(app)/health/eat/actions";

export type WrapupResult<T = undefined> =
  | ({ ok: true; xp?: number } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");
const uuid = z.string().uuid();
const KNOWN_FOOD_LIMIT = 60;

async function ctxOrNull() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, userId: user.id } : null;
}

function revalidateDay() {
  revalidatePath("/daily");
  revalidatePath("/dashboard");
}

// ---------------------------------------------------------------------------
// Food

/** Read a typed-out day into meals, for checking before anything is saved. */
export async function parseDayFood(rawText: string): Promise<WrapupResult<{ meals: ParsedDayMeal[] }>> {
  const parsed = z.string().trim().min(2).max(3000).safeParse(rawText);
  if (!parsed.success) return { ok: false, error: "Write out what you ate first." };

  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { data: knownFoods } = await ctx.supabase
    .from("foods")
    .select("name")
    .eq("owner_id", ctx.userId)
    .order("times_used", { ascending: false })
    .limit(KNOWN_FOOD_LIMIT);

  try {
    // A whole day is several meals' worth of JSON, and the thinking models
    // spend part of the budget before writing any of it.
    const raw = await generateJson(
      getDayParsePrompt((knownFoods ?? []).map((f) => f.name)),
      [{ role: "user", parts: [{ text: parsed.data }] }],
      DAY_PARSE_RESPONSE_SCHEMA,
      { maxOutputTokens: 12288, thinkingBudget: 1024 }
    );
    const result = dayParseResultSchema.safeParse(raw);
    if (!result.success) return { ok: false, error: "The estimate came back unreadable. Try again." };
    const meals = result.data.meals.filter((m) => m.items.length > 0);
    if (meals.length === 0) return { ok: false, error: "No food found in that. Try naming the dishes." };
    return { ok: true, data: { meals } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "The estimate failed." };
  }
}

const dayFoodSchema = z.object({
  logDate: isoDate,
  meals: z
    .array(
      z.object({
        mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
        said: z.string().max(2000),
        items: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(120),
              qty: z.number().positive().max(10_000),
              unit: z.string().trim().min(1).max(30),
              kcal: z.number().min(0).max(20_000),
              protein_g: z.number().min(0).max(2000),
              carbs_g: z.number().min(0).max(2000),
              fat_g: z.number().min(0).max(2000),
              fiber_g: z.number().min(0).max(2000).nullable().optional(),
            })
          )
          .min(1)
          .max(30),
      })
    )
    .min(1)
    .max(12),
});

/** Save the checked meals: each one exactly as the Eat page would. */
export async function saveDayFood(input: z.input<typeof dayFoodSchema>): Promise<WrapupResult> {
  const parsed = dayFoodSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  let xp = 0;
  for (const meal of parsed.data.meals) {
    const saved = await saveMeal({
      logDate: parsed.data.logDate,
      mealType: meal.mealType,
      rawText: meal.said.trim() || null,
      items: meal.items,
    });
    if (!saved.ok) return { ok: false, error: saved.error };
    xp += saved.xp ?? 0;
  }
  revalidateDay();
  return { ok: true, xp };
}

// ---------------------------------------------------------------------------
// Training

const quickSessionSchema = z.object({
  logDate: isoDate,
  name: z.string().trim().min(1).max(80),
  activity: z.enum(["strength", "cardio", "walk", "sport", "other"]),
  minutes: z.number().int().min(1).max(600),
});

/**
 * "Push day, 50 min": a session with no sets. It counts for goal actions and
 * the tracked day like any other. XP is once per day, so tapping three chips
 * isn't worth three workouts.
 */
export async function logQuickSession(
  input: z.input<typeof quickSessionSchema>
): Promise<WrapupResult<{ id: string }>> {
  const parsed = quickSessionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { data, error } = await ctx.supabase
    .from("workouts")
    .insert({
      owner_id: ctx.userId,
      log_date: parsed.data.logDate,
      name: parsed.data.name,
      activity: parsed.data.activity,
      duration_min: parsed.data.minutes,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: "Couldn't save the session. Try again." };

  const xp = await awardXp(ctx.supabase, ctx.userId, "workout_logged", `quick:${parsed.data.logDate}`, parsed.data.logDate);
  revalidateDay();
  revalidatePath("/health/train");
  revalidatePath("/health");
  return { ok: true, data: { id: data.id }, xp };
}

export async function removeQuickSession(id: string): Promise<WrapupResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "That session doesn't exist." };
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: "Not authenticated" };
  // Only sessions without sets: one logged set by set is edited on the Train page.
  const { count } = await ctx.supabase
    .from("workout_sets")
    .select("id", { count: "exact", head: true })
    .eq("workout_id", id);
  if ((count ?? 0) > 0) return { ok: false, error: "This session has sets. Remove it from the Train page." };
  const { error } = await ctx.supabase.from("workouts").delete().eq("id", id).eq("owner_id", ctx.userId);
  if (error) return { ok: false, error: "Couldn't remove the session. Try again." };
  revalidateDay();
  revalidatePath("/health/train");
  revalidatePath("/health");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Goals past their end date

/** Days added by the one extension: half the goal again, between one and four weeks. */
function extensionDays(startDate: string, targetDate: string): number {
  const length = (Date.parse(targetDate) - Date.parse(startDate)) / 86_400_000;
  return Math.min(28, Math.max(7, Math.round(length / 2)));
}

/**
 * Give a goal that ran out one more stretch, counted from today. Only once:
 * after that the choice is done or let go, so a goal can't drift forever.
 */
export async function extendGoalOnce(id: string): Promise<WrapupResult<{ targetDate: string }>> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "That goal doesn't exist." };
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { data: goal } = await ctx.supabase
    .from("goals")
    .select("id, start_date, target_date, extended_at")
    .eq("id", id)
    .eq("owner_id", ctx.userId)
    .maybeSingle();
  if (!goal) return { ok: false, error: "That goal doesn't exist anymore." };
  if (goal.extended_at) return { ok: false, error: "This goal was already extended once. Mark it done or let it go." };

  const today = await todayIsoLocal();
  const from = goal.target_date > today ? goal.target_date : today;
  const targetDate = format(addDays(new Date(`${from}T00:00:00`), extensionDays(goal.start_date, goal.target_date)), "yyyy-MM-dd");

  const { error } = await ctx.supabase
    .from("goals")
    .update({ target_date: targetDate, horizon: "custom", extended_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", ctx.userId);
  if (error) return { ok: false, error: "Couldn't extend the goal. Try again." };

  revalidateDay();
  revalidatePath("/goals");
  revalidatePath(`/goals/${id}`);
  return { ok: true, data: { targetDate } };
}
