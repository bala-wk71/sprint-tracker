"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { awardXp } from "@/lib/gamification";
import { readHealthProfile } from "@/lib/health/profile";
import { todayIsoLocal } from "@/lib/dates";

export type ActionResult<T = undefined> =
  | ({ ok: true; xp?: number } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");

async function getUserOrFail() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

const logWaterSchema = z.object({
  logDate: isoDate,
  amountMl: z.number().int().min(1).max(5000),
});

/**
 * Add one drink. Rows are per-sip rather than a running daily total, so the
 * last tap can be undone without recomputing anything.
 */
export async function logWater(
  input: z.infer<typeof logWaterSchema>
): Promise<ActionResult<{ id: string; totalMl: number }>> {
  const parsed = logWaterSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { data, error } = await ctx.supabase
    .from("water_logs")
    .insert({
      owner_id: ctx.user.id,
      log_date: parsed.data.logDate,
      amount_ml: parsed.data.amountMl,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  const [{ data: dayRows }, profile] = await Promise.all([
    ctx.supabase
      .from("water_logs")
      .select("amount_ml")
      .eq("owner_id", ctx.user.id)
      .eq("log_date", parsed.data.logDate),
    readHealthProfile(ctx.supabase, ctx.user.id),
  ]);

  const totalMl = (dayRows ?? []).reduce((s, r) => s + r.amount_ml, 0);

  // Awarded once per day, on the sip that crosses the goal. Drinking more
  // afterwards earns nothing extra, and the dedupe key means re-crossing it
  // after an undo does not pay twice.
  const xp =
    totalMl >= profile.daily_water_ml_goal
      ? await awardXp(ctx.supabase, ctx.user.id, "water_goal", parsed.data.logDate)
      : 0;

  revalidatePath("/health");
  return { ok: true, data: { id: data.id, totalMl }, xp };
}

export type QuickLogState = {
  logDate: string;
  waterEntries: { id: string; amount_ml: number }[];
  waterGoalMl: number;
  volumeUnit: "ml" | "oz";
  weightUnit: "kg" | "lb";
  weightKg: number | null;
  hasWorkoutToday: boolean;
};

/**
 * Everything the quick-log sheet needs, fetched when it opens rather than on
 * every page render. The button lives in the app shell, so making it eager
 * would put two queries on the dashboard, the todo list and every note page
 * for a panel most visits never open.
 */
export async function loadQuickLogState(): Promise<
  ActionResult<QuickLogState>
> {
  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const logDate = await todayIsoLocal();

  const [profile, { data: water }, { data: body }, { count: workoutCount }] =
    await Promise.all([
      readHealthProfile(ctx.supabase, ctx.user.id),
      ctx.supabase
        .from("water_logs")
        .select("id, amount_ml")
        .eq("owner_id", ctx.user.id)
        .eq("log_date", logDate)
        .order("logged_at"),
      ctx.supabase
        .from("body_metrics")
        .select("weight_kg")
        .eq("owner_id", ctx.user.id)
        .eq("measured_on", logDate)
        .maybeSingle(),
      ctx.supabase
        .from("workouts")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", ctx.user.id)
        .eq("log_date", logDate),
    ]);

  return {
    ok: true,
    data: {
      logDate,
      waterEntries: water ?? [],
      waterGoalMl: profile.daily_water_ml_goal,
      volumeUnit: profile.volume_unit,
      weightUnit: profile.weight_unit,
      weightKg: body?.weight_kg ?? null,
      hasWorkoutToday: (workoutCount ?? 0) > 0,
    },
  };
}

export async function deleteWaterLog(id: string): Promise<ActionResult> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "Invalid entry" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { error } = await ctx.supabase
    .from("water_logs")
    .delete()
    .eq("id", parsed.data)
    .eq("owner_id", ctx.user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/health");
  return { ok: true };
}
