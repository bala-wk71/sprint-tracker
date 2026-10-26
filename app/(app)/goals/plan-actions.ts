"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { todayIsoLocal } from "@/lib/dates";
import { GOAL_AREA_VALUES } from "@/lib/goals/constants";
import { LEVER_SOURCE_VALUES, MEASURE_SOURCES } from "@/lib/planning/constants";
import {
  budgetProblem,
  freeHours,
  loadTimeBudget,
  PUSH_LIMIT,
  PUSH_LIMIT_MESSAGE,
} from "@/lib/planning/focus";

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

  // The week only holds so much: more hours here have to come from somewhere.
  const { data: current } = await ctx.supabase
    .from("streams")
    .select("id, weekly_hours")
    .eq("owner_id", ctx.userId)
    .is("archived_at", null);
  const before = Number(current?.find((s) => s.id === v.id)?.weekly_hours ?? 0);
  if ((v.weeklyHours ?? 0) > before) {
    const planned =
      (current ?? []).filter((s) => s.id !== v.id).reduce((sum, s) => sum + Number(s.weekly_hours ?? 0), 0) + (v.weeklyHours ?? 0);
    const problem = budgetProblem(planned, freeHours(await loadTimeBudget(ctx.supabase, ctx.userId)));
    if (problem) return { ok: false, error: problem };
  }

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

/** Push (at most three at a time) or maintain: hours only, no new short goals. */
export async function setStreamFocus(id: string, focus: "push" | "maintain"): Promise<PlanResult> {
  if (!uuid.safeParse(id).success || (focus !== "push" && focus !== "maintain")) {
    return { ok: false, error: "That stream doesn't exist." };
  }
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: SIGNED_OUT };
  if (focus === "push") {
    const { count } = await ctx.supabase
      .from("streams")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ctx.userId)
      .eq("focus", "push")
      .is("archived_at", null)
      .neq("id", id);
    if ((count ?? 0) >= PUSH_LIMIT) return { ok: false, error: PUSH_LIMIT_MESSAGE };
  }
  const { error } = await ctx.supabase.from("streams").update({ focus }).eq("id", id).eq("owner_id", ctx.userId);
  // The database holds the same limit, for a race between two tabs.
  if (error) {
    return { ok: false, error: error.message.includes("push_limit") ? PUSH_LIMIT_MESSAGE : "Couldn't change the stream. Try again." };
  }
  revalidatePlan();
  return { ok: true };
}

const budgetSchema = z.object({
  sleepHours: z.number().min(0).max(14),
  jobHours: z.number().min(0).max(100),
  overheadHours: z.number().min(0).max(100),
});

/** What the week holds before any stream. The streams have to still fit after. */
export async function saveTimeBudget(input: z.input<typeof budgetSchema>): Promise<PlanResult> {
  const parsed = budgetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Hours should be numbers: sleep up to 14 a night, the rest up to 100 a week." };
  }
  const v = parsed.data;
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: SIGNED_OUT };

  const { data: streams } = await ctx.supabase
    .from("streams")
    .select("weekly_hours")
    .eq("owner_id", ctx.userId)
    .is("archived_at", null);
  const planned = (streams ?? []).reduce((sum, s) => sum + Number(s.weekly_hours ?? 0), 0);
  const free = freeHours(v);
  if (planned > free) {
    return { ok: false, error: `Your streams plan ${planned}h a week, and that would leave ${free}h. Lower a stream's hours first.` };
  }

  const { error } = await ctx.supabase.from("time_budgets").upsert({
    owner_id: ctx.userId,
    sleep_hours: v.sleepHours,
    job_hours: v.jobHours,
    overhead_hours: v.overheadHours,
  });
  if (error) return { ok: false, error: "Couldn't save your week. Try again." };
  revalidatePlan();
  return { ok: true };
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

/**
 * Move one checkpoint to a new date when the forecast says the old one isn't
 * realistic. Nothing moves on its own; shifted_days keeps the original on record.
 */
export async function moveCheckpoint(input: {
  measureId: string;
  goalId: string;
  fromDate: string;
  toDate: string;
}): Promise<PlanResult> {
  const parsed = z.object({ measureId: uuid, goalId: uuid, fromDate: isoDate, toDate: isoDate }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pick a valid date." };
  const v = parsed.data;
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: SIGNED_OUT };
  if (v.toDate <= (await todayIsoLocal())) return { ok: false, error: "Pick a date after today." };

  const { data: rows } = await ctx.supabase
    .from("measure_checkpoints")
    .select("id, target_date, hold_until, shifted_days")
    .eq("measure_id", v.measureId)
    .eq("owner_id", ctx.userId)
    .order("target_date");
  const checkpoints = rows ?? [];
  const moving = checkpoints.find((c) => c.target_date === v.fromDate);
  if (!moving) return { ok: false, error: "That checkpoint has changed. Reload and try again." };
  const after = checkpoints.find((c) => c.target_date > v.fromDate);
  if (after && v.toDate >= after.target_date) {
    return { ok: false, error: "That's past the next checkpoint. Edit the path to move both." };
  }
  if (checkpoints.some((c) => c.id !== moving.id && c.target_date === v.toDate)) {
    return { ok: false, error: "There's already a checkpoint on that date." };
  }
  const shift = Math.round((Date.parse(`${v.toDate}T00:00:00Z`) - Date.parse(`${v.fromDate}T00:00:00Z`)) / 86_400_000);
  const { error } = await ctx.supabase
    .from("measure_checkpoints")
    .update({
      target_date: v.toDate,
      shifted_days: moving.shifted_days + shift,
      hold_until: moving.hold_until && moving.hold_until >= v.toDate ? moving.hold_until : null,
    })
    .eq("id", moving.id)
    .eq("owner_id", ctx.userId);
  if (error) return { ok: false, error: "Couldn't move the checkpoint. Try again." };
  revalidatePlan(v.goalId);
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
  source: z.enum(LEVER_SOURCE_VALUES),
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
