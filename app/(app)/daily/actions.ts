"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { awardTimeLogXp, awardXp } from "@/lib/gamification";
import { getWeekStartDay } from "@/lib/dates";
import { weekStartIsoOf } from "@/lib/week";

export type ActionResult<T = undefined> =
  | ({ ok: true; xp?: number } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");

const morningMood = z.enum([
  "energised",
  "neutral",
  "tired",
  "stressed",
  "pumped",
]);

const eveningMood = z.enum([
  "accomplished",
  "okay",
  "exhausted",
  "frustrated",
  "proud",
]);

const priorityStatus = z.enum(["pending", "done", "partial", "missed"]);

async function getUserOrFail() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

/**
 * Get-or-create the daily_log row for (user, date). Used by every mutation
 * so that the user can save *any* section first without ordering constraints.
 */
async function ensureDailyLog(
  ctx: NonNullable<Awaited<ReturnType<typeof getUserOrFail>>>,
  date: string
) {
  const { data: existing } = await ctx.supabase
    .from("daily_logs")
    .select("id, sprint_id")
    .eq("owner_id", ctx.user.id)
    .eq("log_date", date)
    .maybeSingle();

  if (existing) return existing;

  // Find the sprint for this week so the daily log can be linked.
  const weekStart = weekStartIsoOf(date, await getWeekStartDay());
  const { data: sprint } = await ctx.supabase
    .from("sprints")
    .select("id")
    .eq("owner_id", ctx.user.id)
    .eq("week_start_date", weekStart)
    .maybeSingle();

  const { data: created, error } = await ctx.supabase
    .from("daily_logs")
    .insert({
      owner_id: ctx.user.id,
      log_date: date,
      sprint_id: sprint?.id ?? null,
    })
    .select("id, sprint_id")
    .single();

  if (error || !created) throw new Error(error?.message ?? "Failed to create log");
  return created;
}

// ----------------------------------------------------------------------
// Morning check-in
// ----------------------------------------------------------------------

const morningSchema = z.object({
  date: dateString,
  morning_mood: morningMood.nullable(),
  morning_energy: z.coerce.number().int().min(1).max(10).nullable(),
  daily_intention: z.string().trim().max(280),
  priorities: z
    .array(
      z.object({
        position: z.number().int().min(1).max(3),
        description: z.string().trim().min(1).max(280),
        target_hours: z.coerce.number().min(0).max(24),
      })
    )
    .max(3),
});

export type MorningInput = z.infer<typeof morningSchema>;

export async function saveMorningCheckIn(
  input: MorningInput
): Promise<ActionResult> {
  const parsed = morningSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  try {
    const log = await ensureDailyLog(ctx, parsed.data.date);

    const { error: updateError } = await ctx.supabase
      .from("daily_logs")
      .update({
        morning_mood: parsed.data.morning_mood,
        morning_energy: parsed.data.morning_energy,
        daily_intention: parsed.data.daily_intention || null,
      })
      .eq("id", log.id);

    if (updateError) return { ok: false, error: updateError.message };

    // Replace priorities atomically: delete then insert.
    const { error: deleteError } = await ctx.supabase
      .from("priorities")
      .delete()
      .eq("daily_log_id", log.id);

    if (deleteError) return { ok: false, error: deleteError.message };

    if (parsed.data.priorities.length > 0) {
      const rows = parsed.data.priorities.map((p) => ({
        daily_log_id: log.id,
        position: p.position,
        description: p.description,
        target_hours: p.target_hours,
        // status defaults to 'pending'
      }));
      const { error: insertError } = await ctx.supabase
        .from("priorities")
        .insert(rows);
      if (insertError) return { ok: false, error: insertError.message };
    }

    // A check-in earns XP once per day (mood or energy actually filled in).
    let xp = 0;
    if (parsed.data.morning_mood || parsed.data.morning_energy !== null) {
      xp = await awardXp(
        ctx.supabase,
        ctx.user.id,
        "morning_checkin",
        parsed.data.date
      );
    }

    revalidatePath("/daily");
    revalidatePath("/dashboard");
    return { ok: true, xp };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

// ----------------------------------------------------------------------
// Time entries
// ----------------------------------------------------------------------

const timeEntrySchema = z.object({
  date: dateString,
  task_id: z.string().uuid().nullable(),
  start_time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Invalid time")
    .nullable(),
  duration_hours: z.coerce.number().positive().max(24),
  energy_during: z.coerce.number().int().min(1).max(5).nullable(),
  notes: z.string().trim().max(2000),
  is_private: z.boolean().default(false),
});

export type TimeEntryInput = z.infer<typeof timeEntrySchema>;

export async function addTimeEntry(input: TimeEntryInput): Promise<ActionResult> {
  const parsed = timeEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  try {
    const log = await ensureDailyLog(ctx, parsed.data.date);

    const { data: entry, error } = await ctx.supabase
      .from("time_entries")
      .insert({
        daily_log_id: log.id,
        owner_id: ctx.user.id,
        task_id: parsed.data.task_id,
        start_time: parsed.data.start_time,
        duration_hours: parsed.data.duration_hours,
        energy_during: parsed.data.energy_during,
        notes: parsed.data.notes || null,
        is_private: parsed.data.is_private,
      })
      .select("id")
      .single();

    if (error) return { ok: false, error: error.message };

    // XP scales with the day's total logged hours (capped), not per entry.
    const xp = entry
      ? await awardTimeLogXp(
          ctx.supabase,
          ctx.user.id,
          parsed.data.date,
          await sumDayHours(ctx, log.id)
        )
      : 0;

    revalidatePath("/daily");
    revalidatePath("/dashboard");
    return { ok: true, xp };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

async function sumDayHours(
  ctx: NonNullable<Awaited<ReturnType<typeof getUserOrFail>>>,
  dailyLogId: string
): Promise<number> {
  const { data } = await ctx.supabase
    .from("time_entries")
    .select("duration_hours")
    .eq("daily_log_id", dailyLogId);
  return (data ?? []).reduce((sum, e) => sum + Number(e.duration_hours || 0), 0);
}

const updateTimeEntrySchema = timeEntrySchema.extend({
  id: z.string().uuid(),
});

export async function updateTimeEntry(
  input: z.infer<typeof updateTimeEntrySchema>
): Promise<ActionResult> {
  const parsed = updateTimeEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { error } = await ctx.supabase
    .from("time_entries")
    .update({
      task_id: parsed.data.task_id,
      start_time: parsed.data.start_time,
      duration_hours: parsed.data.duration_hours,
      energy_during: parsed.data.energy_during,
      notes: parsed.data.notes || null,
      is_private: parsed.data.is_private,
    })
    .eq("id", parsed.data.id)
    .eq("owner_id", ctx.user.id);

  if (error) return { ok: false, error: error.message };

  // An edit can raise the day's total hours — top up the day's XP accrual.
  const { data: log } = await ctx.supabase
    .from("daily_logs")
    .select("id")
    .eq("owner_id", ctx.user.id)
    .eq("log_date", parsed.data.date)
    .maybeSingle();
  const xp = log
    ? await awardTimeLogXp(
        ctx.supabase,
        ctx.user.id,
        parsed.data.date,
        await sumDayHours(ctx, log.id)
      )
    : 0;

  revalidatePath("/daily");
  revalidatePath("/dashboard");
  return { ok: true, xp };
}

export async function deleteTimeEntry(id: string): Promise<ActionResult> {
  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { error } = await ctx.supabase
    .from("time_entries")
    .delete()
    .eq("id", id)
    .eq("owner_id", ctx.user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/daily");
  revalidatePath("/dashboard");
  return { ok: true };
}

// ----------------------------------------------------------------------
// Evening wrap-up
// ----------------------------------------------------------------------

const eveningSchema = z.object({
  date: dateString,
  closing_mood: eveningMood.nullable(),
  productivity_rating: z.coerce.number().int().min(1).max(10).nullable(),
  reflection: z.string().trim().max(2000),
  reflection_private: z.boolean().default(false),
  improvement: z.string().trim().max(2000),
  win: z.string().trim().max(2000),
  gratitude: z.string().trim().max(2000),
  gratitude_private: z.boolean().default(false),
  priority_statuses: z.array(
    z.object({
      id: z.string().uuid(),
      status: priorityStatus,
    })
  ),
});

export type EveningInput = z.infer<typeof eveningSchema>;

export async function saveEveningWrapUp(
  input: EveningInput
): Promise<ActionResult> {
  const parsed = eveningSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  try {
    const log = await ensureDailyLog(ctx, parsed.data.date);

    const { error: updateError } = await ctx.supabase
      .from("daily_logs")
      .update({
        closing_mood: parsed.data.closing_mood,
        productivity_rating: parsed.data.productivity_rating,
        reflection: parsed.data.reflection || null,
        reflection_private: parsed.data.reflection_private,
        improvement: parsed.data.improvement || null,
        win: parsed.data.win || null,
        gratitude: parsed.data.gratitude || null,
        gratitude_private: parsed.data.gratitude_private,
      })
      .eq("id", log.id);

    if (updateError) return { ok: false, error: updateError.message };

    // Update priority statuses one-by-one. Tiny set (max 3) so no batch needed.
    for (const p of parsed.data.priority_statuses) {
      const { error } = await ctx.supabase
        .from("priorities")
        .update({ status: p.status })
        .eq("id", p.id)
        .eq("daily_log_id", log.id);
      if (error) return { ok: false, error: error.message };
    }

    let xp = 0;
    if (parsed.data.closing_mood || parsed.data.productivity_rating !== null) {
      xp += await awardXp(
        ctx.supabase,
        ctx.user.id,
        "evening_wrapup",
        parsed.data.date
      );
    }
    for (const p of parsed.data.priority_statuses) {
      if (p.status === "done") {
        xp += await awardXp(ctx.supabase, ctx.user.id, "priority_done", p.id);
      }
    }

    // Perfect day: check-in + at least one time entry + wrap-up, same date.
    const [{ data: logRow }, { count: entryCount }] = await Promise.all([
      ctx.supabase
        .from("daily_logs")
        .select("morning_mood, morning_energy, closing_mood")
        .eq("id", log.id)
        .single(),
      ctx.supabase
        .from("time_entries")
        .select("id", { count: "exact", head: true })
        .eq("daily_log_id", log.id),
    ]);
    if (
      logRow &&
      (logRow.morning_mood || logRow.morning_energy !== null) &&
      logRow.closing_mood &&
      (entryCount ?? 0) > 0
    ) {
      xp += await awardXp(
        ctx.supabase,
        ctx.user.id,
        "perfect_day",
        parsed.data.date
      );
    }

    revalidatePath("/daily");
    revalidatePath("/dashboard");
    return { ok: true, xp };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
