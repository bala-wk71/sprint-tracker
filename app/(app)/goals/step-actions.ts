"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { awardXp } from "@/lib/gamification";
import type { GoalResult } from "./actions";

const uuid = z.string().uuid();

async function getUserOrFail() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

function revalidateGoal(goalId: string) {
  revalidatePath(`/goals/${goalId}`);
  revalidatePath("/goals");
  revalidatePath("/dashboard");
}

export async function addGoalStep(goalId: string, title: string): Promise<GoalResult> {
  const clean = title.trim();
  if (!uuid.safeParse(goalId).success) return { ok: false, error: "That goal doesn't exist." };
  if (!clean) return { ok: false, error: "Write the step first." };
  if (clean.length > 200) return { ok: false, error: "Keep each step under 200 characters." };
  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "You're signed out. Sign in and try again." };

  const { data: last } = await ctx.supabase
    .from("goal_steps")
    .select("position")
    .eq("goal_id", goalId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await ctx.supabase.from("goal_steps").insert({
    goal_id: goalId,
    owner_id: ctx.user.id,
    title: clean,
    position: (last?.position ?? -1) + 1,
  });
  if (error) return { ok: false, error: "Couldn't add the step. Try again." };
  revalidateGoal(goalId);
  return { ok: true };
}

export async function setGoalStepDone(stepId: string, done: boolean): Promise<GoalResult> {
  if (!uuid.safeParse(stepId).success) return { ok: false, error: "That step doesn't exist." };
  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "You're signed out. Sign in and try again." };

  const { data, error } = await ctx.supabase
    .from("goal_steps")
    .update({ done_at: done ? new Date().toISOString() : null })
    .eq("id", stepId)
    .eq("owner_id", ctx.user.id)
    .select("goal_id")
    .single();
  if (error || !data) return { ok: false, error: "Couldn't update the step. Try again." };

  // Keyed on the step, so unticking and ticking again never pays twice.
  const xp = done ? await awardXp(ctx.supabase, ctx.user.id, "goal_step", stepId) : 0;
  revalidateGoal(data.goal_id);
  return { ok: true, xp };
}

export async function deleteGoalStep(stepId: string): Promise<GoalResult> {
  if (!uuid.safeParse(stepId).success) return { ok: false, error: "That step doesn't exist." };
  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "You're signed out. Sign in and try again." };

  const { data, error } = await ctx.supabase
    .from("goal_steps")
    .delete()
    .eq("id", stepId)
    .eq("owner_id", ctx.user.id)
    .select("goal_id")
    .single();
  if (error || !data) return { ok: false, error: "Couldn't remove the step. Try again." };
  revalidateGoal(data.goal_id);
  return { ok: true };
}
