"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { awardXp } from "@/lib/gamification";
import { readHealthProfile } from "@/lib/health/profile";

type Client = SupabaseClient<Database>;

export type ActionResult<T = undefined> =
  | ({ ok: true; xp?: number } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");
const uuid = z.string().uuid();
const mealType = z.enum(["breakfast", "lunch", "dinner", "snack"]);

const itemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  qty: z.number().positive().max(10_000),
  unit: z.string().trim().min(1).max(30),
  kcal: z.number().min(0).max(20_000),
  protein_g: z.number().min(0).max(2000),
  carbs_g: z.number().min(0).max(2000),
  fat_g: z.number().min(0).max(2000),
  fiber_g: z.number().min(0).max(2000).optional().nullable(),
});

type Item = z.infer<typeof itemSchema>;

async function getUserOrFail() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

/**
 * Fold saved items into the personal food library.
 *
 * This is what makes the second serving of anything free: the macros the user
 * accepted (or corrected) become the library entry, so the same meal next week
 * is a tap rather than another estimate. Stored per single unit of the portion
 * so a different quantity scales cleanly.
 */
async function rememberFoods(
  supabase: Client,
  ownerId: string,
  items: Item[]
): Promise<Map<string, string>> {
  const byName = new Map<string, string>();
  if (items.length === 0) return byName;

  // The whole library rather than a filtered lookup: the unique index is on
  // lower(name), and PostgREST's `in` is case-sensitive, so matching "Dal"
  // against a saved "dal" here is what stops the insert below hitting a
  // constraint violation. A personal library is small enough for this.
  const { data: existing } = await supabase
    .from("foods")
    .select("id, name, times_used")
    .eq("owner_id", ownerId)
    .limit(2000);

  const existingByName = new Map(
    (existing ?? []).map((f) => [f.name.toLowerCase(), f])
  );

  for (const item of items) {
    const key = item.name.toLowerCase();
    const perUnit = item.qty > 0 ? 1 / item.qty : 1;
    const found = existingByName.get(key);

    if (found) {
      await supabase
        .from("foods")
        .update({
          times_used: found.times_used + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", found.id);
      byName.set(key, found.id);
      continue;
    }

    const { data: created } = await supabase
      .from("foods")
      .insert({
        owner_id: ownerId,
        name: item.name,
        serving_qty: 1,
        serving_unit: item.unit,
        kcal: item.kcal * perUnit,
        protein_g: item.protein_g * perUnit,
        carbs_g: item.carbs_g * perUnit,
        fat_g: item.fat_g * perUnit,
        fiber_g: (item.fiber_g ?? 0) * perUnit,
        source: "ai",
        times_used: 1,
        last_used_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (created) byName.set(key, created.id);
  }

  return byName;
}

/**
 * Award the protein goal once the day's total crosses it. Swallows its own
 * failures like every other XP award — nutrition logging must not break
 * because gamification did.
 */
async function awardProteinGoal(
  supabase: Client,
  ownerId: string,
  logDate: string
): Promise<number> {
  const profile = await readHealthProfile(supabase, ownerId);
  if (!profile.daily_protein_g_goal) return 0;

  const { data: meals } = await supabase
    .from("meals")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("log_date", logDate)
    .eq("is_template", false);

  const ids = (meals ?? []).map((m) => m.id);
  if (ids.length === 0) return 0;

  const { data: items } = await supabase
    .from("meal_items")
    .select("protein_g")
    .in("meal_id", ids);

  const total = (items ?? []).reduce((s, i) => s + Number(i.protein_g), 0);
  if (total < profile.daily_protein_g_goal) return 0;

  return awardXp(supabase, ownerId, "protein_goal", logDate);
}

/** Find or create the meal a food should land in. */
async function findOrCreateMeal(
  supabase: Client,
  ownerId: string,
  logDate: string,
  type: z.infer<typeof mealType>
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("meals")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("log_date", logDate)
    .eq("meal_type", type)
    .eq("is_template", false)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created } = await supabase
    .from("meals")
    .insert({
      owner_id: ownerId,
      log_date: logDate,
      meal_type: type,
      eaten_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  return created?.id ?? null;
}

async function insertItems(
  supabase: Client,
  ownerId: string,
  mealId: string,
  items: Item[],
  foodIds: Map<string, string>,
  startPosition: number
) {
  return supabase.from("meal_items").insert(
    items.map((item, i) => ({
      owner_id: ownerId,
      meal_id: mealId,
      food_id: foodIds.get(item.name.toLowerCase()) ?? null,
      position: startPosition + i,
      name: item.name,
      qty: item.qty,
      unit: item.unit,
      kcal: item.kcal,
      protein_g: item.protein_g,
      carbs_g: item.carbs_g,
      fat_g: item.fat_g,
      fiber_g: item.fiber_g ?? 0,
    }))
  );
}

// ---------------------------------------------------------------------------

const saveMealSchema = z.object({
  logDate: isoDate,
  mealType,
  rawText: z.string().max(2000).nullable().optional(),
  items: z.array(itemSchema).min(1).max(30),
});

export async function saveMeal(
  input: z.infer<typeof saveMealSchema>
): Promise<ActionResult<{ mealId: string }>> {
  const parsed = saveMealSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { logDate, mealType: type, rawText, items } = parsed.data;

  const { data: meal, error } = await ctx.supabase
    .from("meals")
    .insert({
      owner_id: ctx.user.id,
      log_date: logDate,
      meal_type: type,
      eaten_at: new Date().toISOString(),
      raw_text: rawText ?? null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  const foodIds = await rememberFoods(ctx.supabase, ctx.user.id, items);
  const { error: itemsError } = await insertItems(
    ctx.supabase,
    ctx.user.id,
    meal.id,
    items,
    foodIds,
    0
  );
  if (itemsError) return { ok: false, error: itemsError.message };

  const mealXp = await awardXp(
    ctx.supabase,
    ctx.user.id,
    "meal_logged",
    `${logDate}:${type}`
  );
  const proteinXp = await awardProteinGoal(ctx.supabase, ctx.user.id, logDate);

  revalidatePath("/health/eat");
  revalidatePath("/health");
  return { ok: true, data: { mealId: meal.id }, xp: mealXp + proteinXp };
}

const logFoodSchema = z.object({
  foodId: uuid,
  logDate: isoDate,
  mealType,
  qty: z.number().positive().max(1000).optional(),
});

/** One-tap re-log of something already in the library. */
export async function logFood(
  input: z.infer<typeof logFoodSchema>
): Promise<ActionResult> {
  const parsed = logFoodSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { data: food } = await ctx.supabase
    .from("foods")
    .select(
      "id, name, serving_qty, serving_unit, kcal, protein_g, carbs_g, fat_g, fiber_g, times_used"
    )
    .eq("id", parsed.data.foodId)
    .eq("owner_id", ctx.user.id)
    .maybeSingle();

  if (!food) return { ok: false, error: "That food is no longer in your library." };

  const qty = parsed.data.qty ?? Number(food.serving_qty);
  const factor = Number(food.serving_qty) > 0 ? qty / Number(food.serving_qty) : 1;

  const mealId = await findOrCreateMeal(
    ctx.supabase,
    ctx.user.id,
    parsed.data.logDate,
    parsed.data.mealType
  );
  if (!mealId) return { ok: false, error: "Could not open that meal." };

  const { count } = await ctx.supabase
    .from("meal_items")
    .select("id", { count: "exact", head: true })
    .eq("meal_id", mealId);

  const { error } = await ctx.supabase.from("meal_items").insert({
    owner_id: ctx.user.id,
    meal_id: mealId,
    food_id: food.id,
    position: count ?? 0,
    name: food.name,
    qty,
    unit: food.serving_unit,
    kcal: Number(food.kcal) * factor,
    protein_g: Number(food.protein_g) * factor,
    carbs_g: Number(food.carbs_g) * factor,
    fat_g: Number(food.fat_g) * factor,
    fiber_g: Number(food.fiber_g) * factor,
  });

  if (error) return { ok: false, error: error.message };

  await ctx.supabase
    .from("foods")
    .update({
      times_used: food.times_used + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq("id", food.id);

  const mealXp = await awardXp(
    ctx.supabase,
    ctx.user.id,
    "meal_logged",
    `${parsed.data.logDate}:${parsed.data.mealType}`
  );
  const proteinXp = await awardProteinGoal(
    ctx.supabase,
    ctx.user.id,
    parsed.data.logDate
  );

  revalidatePath("/health/eat");
  revalidatePath("/health");
  return { ok: true, xp: mealXp + proteinXp };
}

const templateSchema = z.object({
  templateId: uuid,
  logDate: isoDate,
  mealType,
});

/** Log a whole saved combo in one tap. */
export async function logTemplate(
  input: z.infer<typeof templateSchema>
): Promise<ActionResult> {
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { data: items } = await ctx.supabase
    .from("meal_items")
    .select("food_id, name, qty, unit, kcal, protein_g, carbs_g, fat_g, fiber_g")
    .eq("meal_id", parsed.data.templateId)
    .eq("owner_id", ctx.user.id)
    .order("position");

  if (!items || items.length === 0)
    return { ok: false, error: "That combo has nothing in it." };

  const mealId = await findOrCreateMeal(
    ctx.supabase,
    ctx.user.id,
    parsed.data.logDate,
    parsed.data.mealType
  );
  if (!mealId) return { ok: false, error: "Could not open that meal." };

  const { count } = await ctx.supabase
    .from("meal_items")
    .select("id", { count: "exact", head: true })
    .eq("meal_id", mealId);

  const { error } = await ctx.supabase.from("meal_items").insert(
    items.map((item, i) => ({
      owner_id: ctx.user.id,
      meal_id: mealId,
      food_id: item.food_id,
      position: (count ?? 0) + i,
      name: item.name,
      qty: item.qty,
      unit: item.unit,
      kcal: item.kcal,
      protein_g: item.protein_g,
      carbs_g: item.carbs_g,
      fat_g: item.fat_g,
      fiber_g: item.fiber_g,
    }))
  );

  if (error) return { ok: false, error: error.message };

  const mealXp = await awardXp(
    ctx.supabase,
    ctx.user.id,
    "meal_logged",
    `${parsed.data.logDate}:${parsed.data.mealType}`
  );
  const proteinXp = await awardProteinGoal(
    ctx.supabase,
    ctx.user.id,
    parsed.data.logDate
  );

  revalidatePath("/health/eat");
  revalidatePath("/health");
  return { ok: true, xp: mealXp + proteinXp };
}

/** Turn a logged meal into a reusable combo. */
export async function saveAsTemplate(input: {
  mealId: string;
  name: string;
}): Promise<ActionResult> {
  const parsed = z
    .object({ mealId: uuid, name: z.string().trim().min(1).max(60) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Give the combo a name." };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { data: items } = await ctx.supabase
    .from("meal_items")
    .select("food_id, name, qty, unit, kcal, protein_g, carbs_g, fat_g, fiber_g")
    .eq("meal_id", parsed.data.mealId)
    .eq("owner_id", ctx.user.id)
    .order("position");

  if (!items || items.length === 0)
    return { ok: false, error: "There is nothing in that meal to save." };

  const { data: template, error } = await ctx.supabase
    .from("meals")
    .insert({
      owner_id: ctx.user.id,
      log_date: null,
      meal_type: "snack",
      is_template: true,
      template_name: parsed.data.name,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  const { error: itemsError } = await ctx.supabase.from("meal_items").insert(
    items.map((item, i) => ({
      owner_id: ctx.user.id,
      meal_id: template.id,
      food_id: item.food_id,
      position: i,
      name: item.name,
      qty: item.qty,
      unit: item.unit,
      kcal: item.kcal,
      protein_g: item.protein_g,
      carbs_g: item.carbs_g,
      fat_g: item.fat_g,
      fiber_g: item.fiber_g,
    }))
  );

  if (itemsError) return { ok: false, error: itemsError.message };

  revalidatePath("/health/eat");
  return { ok: true };
}

export async function deleteMeal(mealId: string): Promise<ActionResult> {
  const parsed = uuid.safeParse(mealId);
  if (!parsed.success) return { ok: false, error: "Invalid meal" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { error } = await ctx.supabase
    .from("meals")
    .delete()
    .eq("id", parsed.data)
    .eq("owner_id", ctx.user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/health/eat");
  revalidatePath("/health");
  return { ok: true };
}

export async function deleteMealItem(itemId: string): Promise<ActionResult> {
  const parsed = uuid.safeParse(itemId);
  if (!parsed.success) return { ok: false, error: "Invalid item" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { error } = await ctx.supabase
    .from("meal_items")
    .delete()
    .eq("id", parsed.data)
    .eq("owner_id", ctx.user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/health/eat");
  revalidatePath("/health");
  return { ok: true };
}

export async function toggleFavorite(input: {
  foodId: string;
  isFavorite: boolean;
}): Promise<ActionResult> {
  const parsed = z
    .object({ foodId: uuid, isFavorite: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { error } = await ctx.supabase
    .from("foods")
    .update({ is_favorite: parsed.data.isFavorite })
    .eq("id", parsed.data.foodId)
    .eq("owner_id", ctx.user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/health/eat");
  return { ok: true };
}
