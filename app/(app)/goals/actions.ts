"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { awardTrackedXp } from "@/lib/gamification";
import { todayIsoLocal } from "@/lib/dates";
import {
  GOAL_AREA_VALUES,
  GOAL_HORIZON_VALUES,
  TRACK_TYPE_VALUES,
  targetDateFor,
} from "@/lib/goals/constants";

export type GoalResult<T = undefined> =
  | ({ ok: true; xp?: number } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.");

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
  startValue: z.number().nullable(),
  targetValue: z.number().nullable(),
  unit: z.string().trim().max(20, "Keep the unit short, like km or kg."),
  /** Only used when creating; steps are managed on the goal page after that. */
  steps: z.array(z.string().trim().max(200, "Keep each step under 200 characters.")).max(30),
  parentId: uuid.nullable(),
  isPrivate: z.boolean(),
  checkinEveryDays: z.number().int().min(1).max(120),
});

export type GoalInput = z.input<typeof goalSchema>;

const FIELD_MESSAGES: Record<string, string> = {
  area: "Pick a life area.",
  horizon: "Pick how long this goal runs.",
  trackType: "Pick how you'll track it.",
  checkinEveryDays: "Pick how often to check in.",
  startValue: "Enter a number for where you're starting.",
  targetValue: "Enter a number for your target.",
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

  let startDate = await todayIsoLocal();
  if (v.id) {
    const { data: existing } = await ctx.supabase
      .from("goals")
      .select("start_date")
      .eq("id", v.id)
      .eq("owner_id", ctx.user.id)
      .maybeSingle();
    if (!existing) return { ok: false, error: "That goal doesn't exist anymore." };
    startDate = existing.start_date;
  }

  const targetDate = v.horizon === "custom" ? v.customTargetDate : targetDateFor(v.horizon, startDate);
  if (!targetDate) return { ok: false, error: "Pick an end date." };
  if (targetDate <= startDate) return { ok: false, error: "The end date needs to be after the start." };

  const isNumber = v.trackType === "number";
  if (isNumber) {
    if (v.startValue === null || v.targetValue === null) {
      return { ok: false, error: "Add where you're starting and where you want to be." };
    }
    if (v.startValue === v.targetValue) {
      return { ok: false, error: "The target needs to be different from where you're starting." };
    }
  }

  if (v.parentId) {
    const problem = await parentProblem(ctx, v.parentId, v.id);
    if (problem) return { ok: false, error: problem };
  }

  const fields = {
    title: v.title,
    why: v.why,
    area: v.area,
    horizon: v.horizon,
    target_date: targetDate,
    track_type: v.trackType,
    start_value: isNumber ? v.startValue : null,
    target_value: isNumber ? v.targetValue : null,
    unit: isNumber ? v.unit || null : null,
    parent_id: v.parentId,
    is_private: v.isPrivate,
    checkin_every_days: v.checkinEveryDays,
  };

  if (v.id) {
    const { error } = await ctx.supabase
      .from("goals")
      .update(fields)
      .eq("id", v.id)
      .eq("owner_id", ctx.user.id);
    if (error) return { ok: false, error: "Couldn't save your changes. Try again." };
    revalidateGoal(v.id);
    return { ok: true, data: { id: v.id } };
  }

  const { data, error } = await ctx.supabase
    .from("goals")
    .insert({
      ...fields,
      owner_id: ctx.user.id,
      start_date: startDate,
      current_value: isNumber ? v.startValue : null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Couldn't create the goal. Try again." };

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
    .select("id, title, is_private")
    .eq("id", id)
    .eq("owner_id", ctx.user.id)
    .maybeSingle();
  if (!goal) return { ok: false, error: "That goal doesn't exist anymore." };

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
