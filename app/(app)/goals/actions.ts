"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { awardTrackedXp } from "@/lib/gamification";
import { todayIsoLocal } from "@/lib/dates";
import { goalFocusProblem } from "@/lib/planning/focus";
import { currentPhaseOf, loadPhases } from "@/lib/planning/phases";
import {
  GOAL_AREA_VALUES,
  GOAL_HORIZON_VALUES,
  GOAL_TYPE_VALUES,
  TRACK_TYPE_VALUES,
  targetDateFor,
} from "@/lib/goals/constants";
import { LEVER_SOURCE_VALUES, MEASURE_SOURCES } from "@/lib/planning/constants";
import { saveLever, saveMeasure } from "./plan-actions";

export type GoalResult<T = undefined> =
  | ({ ok: true; xp?: number } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.");
const finite = z.number().finite();

/** A Target's number: where it comes from, where it is, where it should get to. */
const targetSchema = z.object({
  source: z.enum(MEASURE_SOURCES.map((s) => s.value) as [string, ...string[]]),
  label: z.string().trim().min(1, "Name the number.").max(80),
  unit: z.string().trim().max(20),
  start: finite.nullable(),
  target: finite,
  loan: z.object({ emi: z.number().positive(), lastEmiOn: isoDate }).nullable(),
});

/** A Habit's week: what counts, how many, and the least that still keeps the week. */
const habitSchema = z.object({
  source: z.enum(LEVER_SOURCE_VALUES),
  perWeek: z.number().positive("Say how many times a week.").max(168),
  floor: z.number().min(0).max(168),
});

const goalSchema = z.object({
  id: uuid.optional(),
  title: z
    .string()
    .trim()
    .min(1, "Give the goal a name.")
    .max(120, "Keep the name under 120 characters."),
  why: z.string().trim().max(500, "Keep the why to a couple of lines."),
  area: z.enum(GOAL_AREA_VALUES),
  horizon: z.enum(GOAL_HORIZON_VALUES),
  customTargetDate: isoDate.nullable(),
  trackType: z.enum(TRACK_TYPE_VALUES),
  /** Only used when creating a Target; its measure is edited on the goal page after that. */
  target: targetSchema.nullable().optional(),
  habit: habitSchema.nullable().optional(),
  /** Only used when creating; steps are managed on the goal page after that. */
  steps: z.array(z.string().trim().max(200, "Keep each step under 200 characters.")).max(30),
  parentId: uuid.nullable(),
  /** Undefined leaves the stream as it is; null takes the goal out of its stream. */
  streamId: uuid.nullable().optional(),
  isPrivate: z.boolean(),
  checkinEveryDays: z.number().int().min(1).max(120),
});

export type GoalInput = z.input<typeof goalSchema>;

const FIELD_MESSAGES: Record<string, string> = {
  area: "Pick a life area.",
  horizon: "Pick how long this goal runs.",
  trackType: "Pick what kind of goal it is.",
  checkinEveryDays: "Pick how often to check in.",
};

function firstError(error: z.ZodError) {
  const issue = error.issues[0];
  return FIELD_MESSAGES[String(issue?.path[0] ?? "")] ?? issue?.message ?? "Check the form and try again.";
}

async function getUserOrFail() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

type Ctx = NonNullable<Awaited<ReturnType<typeof getUserOrFail>>>;

function revalidateGoal(id?: string) {
  revalidatePath("/goals");
  if (id) revalidatePath(`/goals/${id}`);
  revalidatePath("/dashboard");
}

/** Walks up from the chosen parent so a goal can never end up inside itself. */
async function parentProblem(ctx: Ctx, parentId: string, selfId?: string) {
  let cursor: string | null = parentId;
  for (let depth = 0; cursor && depth < 20; depth++) {
    if (cursor === selfId) return "A goal can't sit under one of its own smaller goals.";
    const { data }: { data: { parent_id: string | null } | null } = await ctx.supabase
      .from("goals")
      .select("parent_id")
      .eq("id", cursor)
      .eq("owner_id", ctx.user.id)
      .maybeSingle();
    if (!data) return depth === 0 ? "That bigger goal doesn't exist anymore." : null;
    cursor = data.parent_id;
  }
  return null;
}

export async function saveGoal(input: GoalInput): Promise<GoalResult<{ id: string }>> {
  const parsed = goalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const v = parsed.data;
  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "You're signed out. Sign in and try again." };

  const today = await todayIsoLocal();
  let startDate = today;
  let existing: { start_date: string; level: string | null; status: string; stream_id: string | null } | null = null;
  if (v.id) {
    const { data } = await ctx.supabase
      .from("goals")
      .select("start_date, level, status, stream_id")
      .eq("id", v.id)
      .eq("owner_id", ctx.user.id)
      .maybeSingle();
    if (!data) return { ok: false, error: "That goal doesn't exist anymore." };
    existing = data;
    startDate = data.start_date;
  }

  const targetDate = v.horizon === "custom" ? v.customTargetDate : targetDateFor(v.horizon, startDate);
  if (!targetDate) return { ok: false, error: "Pick an end date." };
  if (targetDate <= startDate) return { ok: false, error: "The end date needs to be after the start." };

  if (!v.id && !(GOAL_TYPE_VALUES as readonly string[]).includes(v.trackType)) {
    return { ok: false, error: "Pick what kind of goal it is." };
  }
  const target = !v.id && v.trackType === "number" ? v.target ?? null : null;
  if (!v.id && v.trackType === "number") {
    if (!target) return { ok: false, error: "Say which number, where it is now and where you want it." };
    if (target.source === "loan_schedule" ? !target.loan : target.start === null) {
      return {
        ok: false,
        error: target.source === "loan_schedule" ? "Add the EMI and the last EMI date." : "Say where the number is now.",
      };
    }
    if (target.start !== null && target.start === target.target) {
      return { ok: false, error: "The target needs to be different from where you are now." };
    }
  }
  const habit = v.trackType === "habit" ? v.habit ?? null : null;
  if (v.trackType === "habit") {
    if (!habit) return { ok: false, error: "Say what counts and how many times a week." };
    if (habit.floor > habit.perWeek) return { ok: false, error: "The minimum can't be more than the weekly target." };
  }

  if (v.parentId) {
    const problem = await parentProblem(ctx, v.parentId, v.id);
    if (problem) return { ok: false, error: problem };
  }
  if (v.streamId) {
    const { data: stream } = await ctx.supabase
      .from("streams")
      .select("id")
      .eq("id", v.streamId)
      .eq("owner_id", ctx.user.id)
      .is("archived_at", null)
      .maybeSingle();
    if (!stream) return { ok: false, error: "That stream doesn't exist anymore." };
  }

  // A short goal only goes into a push stream. Checked when one is created or
  // moved into a stream, so goals from before the rule can still be edited.
  const movedIn = v.streamId !== undefined && v.streamId !== (existing?.stream_id ?? null);
  if (v.streamId && (!existing || (movedIn && existing.status === "active"))) {
    const focus = await goalFocusProblem(
      ctx.supabase,
      ctx.user.id,
      { stream_id: v.streamId, level: existing?.level ?? null, start_date: startDate, target_date: targetDate },
      today
    );
    if (focus) return { ok: false, error: focus };
  }

  const fields = {
    title: v.title,
    why: v.why,
    area: v.area,
    horizon: v.horizon,
    target_date: targetDate,
    parent_id: v.parentId,
    is_private: v.isPrivate,
    checkin_every_days: v.checkinEveryDays,
    ...(v.streamId === undefined ? {} : { stream_id: v.streamId }),
  };

  if (v.id) {
    const { error } = await ctx.supabase
      .from("goals")
      .update(fields)
      .eq("id", v.id)
      .eq("owner_id", ctx.user.id);
    if (error) return { ok: false, error: "Couldn't save your changes. Try again." };
    if (habit) {
      const problem = await saveHabit(ctx, v.id, v.title, habit);
      if (problem) return { ok: false, error: problem };
    }
    revalidateGoal(v.id);
    return { ok: true, data: { id: v.id } };
  }

  // A goal that ends inside the current phase is part of it.
  const current = currentPhaseOf(await loadPhases(ctx.supabase, ctx.user.id));
  const { data, error } = await ctx.supabase
    .from("goals")
    .insert({
      ...fields,
      owner_id: ctx.user.id,
      start_date: startDate,
      track_type: v.trackType,
      // Kept on the row too, so summaries that only read goals can still say it.
      start_value: target?.start ?? null,
      target_value: target?.target ?? null,
      current_value: target?.start ?? null,
      unit: target ? target.unit || null : null,
      phase_id: current && targetDate <= current.endsOn ? current.id : null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Couldn't create the goal. Try again." };

  // A Target's number and a Habit's week are what make them track
  // themselves; without them the goal is half made, so it goes again.
  const problem = target
    ? await saveTarget(data.id, startDate, targetDate, target)
    : habit
      ? await saveHabit(ctx, data.id, v.title, habit)
      : null;
  if (problem) {
    await ctx.supabase.from("goals").delete().eq("id", data.id).eq("owner_id", ctx.user.id);
    return { ok: false, error: problem };
  }

  const steps = v.steps.filter(Boolean);
  if (v.trackType === "steps" && steps.length > 0) {
    await ctx.supabase.from("goal_steps").insert(
      steps.map((title, position) => ({
        goal_id: data.id,
        owner_id: ctx.user.id,
        title,
        position,
      }))
    );
  }

  revalidateGoal(data.id);
  return { ok: true, data: { id: data.id } };
}

/** The measure behind a Target: a straight path from today to the target on the end date. */
async function saveTarget(goalId: string, startIso: string, endIso: string, t: z.infer<typeof targetSchema>) {
  const source = MEASURE_SOURCES.find((s) => s.value === t.source) ?? MEASURE_SOURCES[0];
  const direction = t.source === "loan_schedule" || (t.start !== null && t.target < t.start) ? "down" : "up";
  const result = await saveMeasure({
    goalId,
    label: t.label,
    kind: "number",
    unit: t.unit,
    direction,
    interpolate: "linear",
    source: t.source,
    loan: t.loan,
    cadence: source.cadence,
    baselineValue: t.start,
    baselineOn: t.start === null ? null : startIso,
    scale: [],
    checkpoints: [{ date: endIso, label: null, min: t.target, max: t.target, relative: false, holdUntil: null }],
  });
  return result.ok ? null : result.error;
}

/** A Habit is one weekly action on the goal; editing the habit edits that action. */
async function saveHabit(ctx: Ctx, goalId: string, title: string, h: z.infer<typeof habitSchema>) {
  const { data: existing } = await ctx.supabase
    .from("goal_levers")
    .select("id")
    .eq("goal_id", goalId)
    .eq("owner_id", ctx.user.id)
    .is("archived_at", null)
    .order("position")
    .limit(1)
    .maybeSingle();
  const result = await saveLever({
    id: existing?.id,
    goalId,
    title: title.slice(0, 80),
    source: h.source,
    period: "week",
    target: h.perWeek,
    floor: h.floor,
  });
  return result.ok ? null : result.error;
}

const statusSchema = z.object({
  id: uuid,
  status: z.enum(["active", "paused", "done", "let_go"]),
  note: z.string().trim().max(5000, "That note is too long."),
});

/**
 * Pause, resume, finish or let go. A closing note is saved to the journal,
 * attached to the goal, so the story of how it ended stays with it.
 */
export async function setGoalStatus(input: z.input<typeof statusSchema>): Promise<GoalResult> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const { id, status, note } = parsed.data;
  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "You're signed out. Sign in and try again." };

  const { data: goal } = await ctx.supabase
    .from("goals")
    .select("id, title, is_private, status, stream_id, level, start_date, target_date")
    .eq("id", id)
    .eq("owner_id", ctx.user.id)
    .maybeSingle();
  if (!goal) return { ok: false, error: "That goal doesn't exist anymore." };

  if (status === "active" && goal.status !== "active") {
    const focus = await goalFocusProblem(ctx.supabase, ctx.user.id, goal, await todayIsoLocal());
    if (focus) return { ok: false, error: focus };
  }

  const { error } = await ctx.supabase
    .from("goals")
    .update({ status, completed_at: status === "done" ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("owner_id", ctx.user.id);
  if (error) return { ok: false, error: "Couldn't update the goal. Try again." };

  if (note && (status === "done" || status === "let_go")) {
    await ctx.supabase.from("journal_entries").insert({
      owner_id: ctx.user.id,
      entry_date: await todayIsoLocal(),
      title: `${status === "done" ? "Finished" : "Let go"}: ${goal.title}`,
      body: note,
      kind: "entry",
      goal_id: goal.id,
      is_private: goal.is_private,
    });
    revalidatePath("/journal");
  }

  const xp =
    status === "done"
      ? await awardTrackedXp(
          ctx.supabase,
          ctx.user.id,
          "goal_done",
          goal.id,
          await todayIsoLocal()
        )
      : 0;
  revalidateGoal(id);
  return { ok: true, xp };
}

export async function setGoalPinned(id: string, pinned: boolean): Promise<GoalResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "That goal doesn't exist." };
  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "You're signed out. Sign in and try again." };
  const { error } = await ctx.supabase
    .from("goals")
    .update({ pinned })
    .eq("id", id)
    .eq("owner_id", ctx.user.id);
  if (error) return { ok: false, error: "Couldn't update the goal. Try again." };
  revalidateGoal(id);
  return { ok: true };
}

export async function changeGoalEndDate(id: string, targetDate: string): Promise<GoalResult> {
  if (!uuid.safeParse(id).success || !isoDate.safeParse(targetDate).success) {
    return { ok: false, error: "Pick a valid date." };
  }
  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "You're signed out. Sign in and try again." };
  const { data: goal } = await ctx.supabase
    .from("goals")
    .select("start_date")
    .eq("id", id)
    .eq("owner_id", ctx.user.id)
    .maybeSingle();
  if (!goal) return { ok: false, error: "That goal doesn't exist anymore." };
  if (targetDate <= goal.start_date) {
    return { ok: false, error: "The end date needs to be after the goal started." };
  }
  const { error } = await ctx.supabase
    .from("goals")
    .update({ target_date: targetDate, horizon: "custom" })
    .eq("id", id)
    .eq("owner_id", ctx.user.id);
  if (error) return { ok: false, error: "Couldn't change the date. Try again." };
  revalidateGoal(id);
  return { ok: true };
}

export async function deleteGoal(id: string): Promise<GoalResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "That goal doesn't exist." };
  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "You're signed out. Sign in and try again." };
  const { error } = await ctx.supabase
    .from("goals")
    .delete()
    .eq("id", id)
    .eq("owner_id", ctx.user.id);
  if (error) return { ok: false, error: "Couldn't delete the goal. Try again." };
  revalidateGoal();
  revalidatePath("/journal");
  return { ok: true };
}
