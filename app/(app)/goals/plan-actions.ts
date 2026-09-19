"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { todayIsoLocal } from "@/lib/dates";
import { GOAL_AREA_VALUES } from "@/lib/goals/constants";
import { MEASURE_SOURCES } from "@/lib/planning/constants";
import { quarterEndIso, quarterLabel, quarterOf, quarterStartIso, nextQuarter } from "@/lib/planning/quarters";

export type PlanResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.");
const finite = z.number().finite();

const SIGNED_OUT = "You're signed out. Sign in and try again.";

async function ctxOrNull() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, userId: user.id } : null;
}

function revalidatePlan(goalId?: string) {
  revalidatePath("/goals");
  if (goalId) revalidatePath(`/goals/${goalId}`);
  revalidatePath("/goals/streams", "layout");
  revalidatePath("/dashboard");
}

// ---------------------------------------------------------------------------
// Streams

const streamSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1, "Give the stream a name.").max(60, "Keep the name under 60 characters."),
  area: z.enum(GOAL_AREA_VALUES),
  weeklyHours: z.number().min(0).max(168).nullable(),
  weight: z.number().min(0).max(10),
});

export async function saveStream(input: z.input<typeof streamSchema>): Promise<PlanResult<{ id: string }>> {
  const parsed = streamSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the stream." };
  const v = parsed.data;
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: SIGNED_OUT };

  const fields = { name: v.name, area: v.area, weekly_hours: v.weeklyHours, weight: v.weight };
  if (v.id) {
    const { error } = await ctx.supabase.from("streams").update(fields).eq("id", v.id).eq("owner_id", ctx.userId);
    if (error) return { ok: false, error: duplicateName(error) ?? "Couldn't save the stream. Try again." };
    revalidatePlan();
    return { ok: true, data: { id: v.id } };
  }
  const { count } = await ctx.supabase
    .from("streams")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ctx.userId);
  const { data, error } = await ctx.supabase
    .from("streams")
    .insert({ ...fields, owner_id: ctx.userId, position: count ?? 0 })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: duplicateName(error) ?? "Couldn't create the stream. Try again." };
  revalidatePlan();
  return { ok: true, data: { id: data.id } };
}

function duplicateName(error: { code?: string } | null) {
  return error?.code === "23505" ? "You already have a stream with that name." : null;
}

/** Archiving keeps the stream's goals; they just stop being grouped under it. */
export async function archiveStream(id: string): Promise<PlanResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "That stream doesn't exist." };
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: SIGNED_OUT };
  const { error } = await ctx.supabase
    .from("streams")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", ctx.userId);
  if (error) return { ok: false, error: "Couldn't archive the stream. Try again." };
  revalidatePlan();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Measures and their path

const checkpointSchema = z.object({
  date: isoDate,
  label: z.string().trim().max(40).nullable(),
  min: finite.nullable(),
  max: finite.nullable(),
  relative: z.boolean(),
  holdUntil: isoDate.nullable(),
});

const measureSchema = z.object({
  id: uuid.optional(),
  goalId: uuid,
  label: z.string().trim().min(1, "Name what you're measuring.").max(80),
  kind: z.enum(["number", "ladder"]),
  unit: z.string().trim().max(20),
  direction: z.enum(["down", "up", "band"]),
  interpolate: z.enum(["linear", "compound", "step"]),
  source: z.enum(MEASURE_SOURCES.map((s) => s.value) as [string, ...string[]]),
  loan: z.object({ emi: z.number().positive(), lastEmiOn: isoDate }).nullable(),
  cadence: z.enum(["weekly", "monthly", "quarterly"]),
  baselineValue: finite.nullable(),
  baselineOn: isoDate.nullable(),
  scale: z
    .array(z.object({ level: z.number().int().min(0).max(20), title: z.string().trim().max(120), proof: z.string().trim().max(200) }))
    .max(12),
  checkpoints: z.array(checkpointSchema).max(60),
});

export type MeasureInput = z.input<typeof measureSchema>;

export async function saveMeasure(input: MeasureInput): Promise<PlanResult<{ id: string }>> {
  const parsed = measureSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the measure." };
  const v = parsed.data;
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: SIGNED_OUT };

  if ((v.baselineValue === null) !== (v.baselineOn === null)) {
    return { ok: false, error: "Give the starting point both a value and a date, or leave both empty." };
  }
  if (v.source === "loan_schedule" && !v.loan) {
    return { ok: false, error: "Add the EMI and the date of the last EMI." };
  }
  for (const c of v.checkpoints) {
    if (c.min === null && c.max === null) return { ok: false, error: "Every checkpoint needs a value." };
    if (c.min !== null && c.max !== null && c.min > c.max) {
      return { ok: false, error: "In a range, the first number should be the smaller one." };
    }
    if (c.holdUntil && c.holdUntil < c.date) return { ok: false, error: "A hold has to end after its checkpoint." };
  }
  const dates = v.checkpoints.map((c) => c.date);
  if (new Set(dates).size !== dates.length) return { ok: false, error: "Two checkpoints share a date." };

  const { data: goal } = await ctx.supabase
    .from("goals")
    .select("id")
    .eq("id", v.goalId)
    .eq("owner_id", ctx.userId)
    .maybeSingle();
  if (!goal) return { ok: false, error: "That goal doesn't exist anymore." };

  const fields = {
    label: v.label,
    kind: v.kind,
    unit: v.kind === "ladder" ? "level" : v.unit || null,
    direction: v.kind === "ladder" ? "up" : v.direction,
    interpolate: v.kind === "ladder" ? "step" : v.interpolate,
    source: v.kind === "ladder" ? "manual" : v.source,
    source_params: v.source === "loan_schedule" && v.loan ? v.loan : {},
    cadence: v.cadence,
    baseline_value: v.baselineValue,
    baseline_on: v.baselineOn,
    scale: v.kind === "ladder" ? v.scale : [],
  };

  let measureId = v.id;
  if (measureId) {
    const { error } = await ctx.supabase
      .from("goal_measures")
      .update(fields)
      .eq("id", measureId)
      .eq("owner_id", ctx.userId)
      .eq("goal_id", v.goalId);
    if (error) return { ok: false, error: "Couldn't save the measure. Try again." };
  } else {
    const { count } = await ctx.supabase
      .from("goal_measures")
      .select("id", { count: "exact", head: true })
      .eq("goal_id", v.goalId);
    const { data, error } = await ctx.supabase
      .from("goal_measures")
      .insert({ ...fields, goal_id: v.goalId, owner_id: ctx.userId, position: count ?? 0 })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: "Couldn't create the measure. Try again." };
    measureId = data.id;
  }

  // The path is edited as a whole, so it is replaced as a whole.
  const { error: clearError } = await ctx.supabase
    .from("measure_checkpoints")
    .delete()
    .eq("measure_id", measureId)
    .eq("owner_id", ctx.userId);
  if (clearError) return { ok: false, error: "Couldn't update the path. Try again." };
  if (v.checkpoints.length > 0) {
    const { error } = await ctx.supabase.from("measure_checkpoints").insert(
      v.checkpoints.map((c) => ({
        measure_id: measureId!,
        owner_id: ctx.userId,
        target_date: c.date,
        label: c.label || null,
        min_value: c.min,
        max_value: c.max,
        relative: c.relative,
        hold_until: c.holdUntil,
      }))
    );
    if (error) return { ok: false, error: "Saved the measure, but not its path. Try again." };
  }

  revalidatePlan(v.goalId);
  return { ok: true, data: { id: measureId } };
}

export async function deleteMeasure(id: string, goalId: string): Promise<PlanResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "That measure doesn't exist." };
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: SIGNED_OUT };
  const { error } = await ctx.supabase.from("goal_measures").delete().eq("id", id).eq("owner_id", ctx.userId);
  if (error) return { ok: false, error: "Couldn't delete the measure. Try again." };
  revalidatePlan(goalId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Readings

const readingSchema = z.object({
  measureId: uuid,
  goalId: uuid,
  measuredOn: isoDate,
  value: finite,
  note: z.string().trim().max(500),
  proofUrl: z.string().trim().max(500),
});

/** One reading per day: logging again on the same day corrects it. */
export async function logReading(input: z.input<typeof readingSchema>): Promise<PlanResult> {
  const parsed = readingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a number." };
  const v = parsed.data;
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: SIGNED_OUT };
  if (v.measuredOn > (await todayIsoLocal())) return { ok: false, error: "Readings can't be in the future." };
  if (v.proofUrl && !/^https?:\/\//i.test(v.proofUrl)) {
    return { ok: false, error: "Proof links should start with http:// or https://." };
  }

  const { error } = await ctx.supabase.from("measure_readings").upsert(
    {
      measure_id: v.measureId,
      owner_id: ctx.userId,
      measured_on: v.measuredOn,
      value: v.value,
      note: v.note || null,
      proof_url: v.proofUrl || null,
    },
    { onConflict: "measure_id,measured_on" }
  );
  if (error) return { ok: false, error: "Couldn't save the reading. Try again." };
  revalidatePlan(v.goalId);
  return { ok: true };
}

export async function deleteReading(measureId: string, measuredOn: string, goalId: string): Promise<PlanResult> {
  if (!uuid.safeParse(measureId).success || !isoDate.safeParse(measuredOn).success) {
    return { ok: false, error: "That reading doesn't exist." };
  }
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: SIGNED_OUT };
  const { error } = await ctx.supabase
    .from("measure_readings")
    .delete()
    .eq("measure_id", measureId)
    .eq("measured_on", measuredOn)
    .eq("owner_id", ctx.userId);
  if (error) return { ok: false, error: "Couldn't delete the reading. Try again." };
  revalidatePlan(goalId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Levers

const leverSchema = z.object({
  id: uuid.optional(),
  goalId: uuid,
  title: z.string().trim().min(1, "Name the action.").max(80),
  source: z.enum(["tick", "workouts", "linked_hours"]),
  period: z.enum(["week", "month"]),
  target: z.number().positive("The target needs to be above zero.").max(999),
  floor: z.number().min(0).max(999),
});

export async function saveLever(input: z.input<typeof leverSchema>): Promise<PlanResult> {
  const parsed = leverSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the action." };
  const v = parsed.data;
  if (v.floor > v.target) return { ok: false, error: "The minimum can't be more than the target." };
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: SIGNED_OUT };

  const fields = { title: v.title, source: v.source, period: v.period, target: v.target, floor: v.floor };
  if (v.id) {
    const { error } = await ctx.supabase
      .from("goal_levers")
      .update(fields)
      .eq("id", v.id)
      .eq("owner_id", ctx.userId);
    if (error) return { ok: false, error: "Couldn't save the action. Try again." };
  } else {
    const { data: goal } = await ctx.supabase
      .from("goals")
      .select("id")
      .eq("id", v.goalId)
      .eq("owner_id", ctx.userId)
      .maybeSingle();
    if (!goal) return { ok: false, error: "That goal doesn't exist anymore." };
    const { error } = await ctx.supabase
      .from("goal_levers")
      .insert({ ...fields, goal_id: v.goalId, owner_id: ctx.userId });
    if (error) return { ok: false, error: "Couldn't add the action. Try again." };
  }
  revalidatePlan(v.goalId);
  return { ok: true };
}

export async function archiveLever(id: string, goalId: string): Promise<PlanResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "That action doesn't exist." };
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: SIGNED_OUT };
  const { error } = await ctx.supabase
    .from("goal_levers")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", ctx.userId);
  if (error) return { ok: false, error: "Couldn't remove the action. Try again." };
  revalidatePlan(goalId);
  return { ok: true };
}

/** +1 or −1 on today's count for a ticked lever. */
export async function tickLever(leverId: string, delta: 1 | -1): Promise<PlanResult<{ today: number }>> {
  if (!uuid.safeParse(leverId).success) return { ok: false, error: "That action doesn't exist." };
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: SIGNED_OUT };
  const today = await todayIsoLocal();

  const { data: lever } = await ctx.supabase
    .from("goal_levers")
    .select("id, goal_id, source")
    .eq("id", leverId)
    .eq("owner_id", ctx.userId)
    .maybeSingle();
  if (!lever || lever.source !== "tick") return { ok: false, error: "That action counts itself." };

  const { data: existing } = await ctx.supabase
    .from("lever_ticks")
    .select("count")
    .eq("lever_id", leverId)
    .eq("done_on", today)
    .maybeSingle();
  const next = Math.max(0, Number(existing?.count ?? 0) + delta);

  const { error } =
    next === 0
      ? await ctx.supabase.from("lever_ticks").delete().eq("lever_id", leverId).eq("done_on", today)
      : await ctx.supabase
          .from("lever_ticks")
          .upsert({ lever_id: leverId, owner_id: ctx.userId, done_on: today, count: next }, { onConflict: "lever_id,done_on" });
  if (error) return { ok: false, error: "Couldn't save that. Try again." };
  revalidatePlan(lever.goal_id);
  return { ok: true, data: { today: next } };
}

// ---------------------------------------------------------------------------
// The cascade

/**
 * Adds a quarter goal under this goal for the current quarter (or the next
 * one), in the same stream and area. Projects go on it as steps, and the
 * week's sprint tasks link to it.
 */
export async function addQuarterGoal(goalId: string, which: "current" | "next"): Promise<PlanResult<{ id: string }>> {
  if (!uuid.safeParse(goalId).success) return { ok: false, error: "That goal doesn't exist." };
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: SIGNED_OUT };
  const today = await todayIsoLocal();

  const { data: parent } = await ctx.supabase
    .from("goals")
    .select("id, title, area, stream_id, is_private, target_date, level")
    .eq("id", goalId)
    .eq("owner_id", ctx.userId)
    .maybeSingle();
  if (!parent) return { ok: false, error: "That goal doesn't exist anymore." };

  const quarter = which === "current" ? quarterOf(today) : nextQuarter(quarterOf(today));
  const start = which === "current" ? today : quarterStartIso(quarter);
  const end = quarterEndIso(quarter);
  if (start > parent.target_date) return { ok: false, error: "This goal ends before that quarter starts." };

  const label = quarterLabel(quarter);
  const { data: existing } = await ctx.supabase
    .from("goals")
    .select("id")
    .eq("owner_id", ctx.userId)
    .eq("parent_id", goalId)
    .eq("level", "quarter")
    .eq("target_date", end)
    .maybeSingle();
  if (existing) return { ok: true, data: { id: existing.id } };

  const title = `${label}: ${parent.title}`.slice(0, 120);
  const { data, error } = await ctx.supabase
    .from("goals")
    .insert({
      owner_id: ctx.userId,
      parent_id: goalId,
      stream_id: parent.stream_id,
      level: "quarter",
      title,
      why: "",
      area: parent.area,
      horizon: "custom",
      start_date: start,
      target_date: end <= parent.target_date ? end : parent.target_date,
      track_type: "steps",
      is_private: parent.is_private,
      checkin_every_days: 7,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Couldn't add the quarter. Try again." };

  if (!parent.level) {
    await ctx.supabase.from("goals").update({ level: "destination" }).eq("id", goalId).eq("owner_id", ctx.userId);
  }
  revalidatePlan(goalId);
  return { ok: true, data: { id: data.id } };
}
