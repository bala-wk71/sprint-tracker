"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { awardXp } from "@/lib/gamification";
import { getWeekStartDay, todayIsoLocal } from "@/lib/dates";
import { weekStartIsoOf } from "@/lib/week";
import { formatValue } from "@/lib/goals/progress";
import type { GoalResult } from "./actions";

const checkInSchema = z.object({
  goalId: z.string().uuid(),
  note: z.string().trim().max(5000, "That note is too long. Keep a check-in short."),
  onTrack: z.number().int().min(1).max(10).nullable(),
  value: z.number().nullable(),
});

/**
 * A check-in is a journal entry with a goal attached: the number or rating
 * moves the goal, and the words land in the journal timeline.
 */
export async function checkInOnGoal(input: z.input<typeof checkInSchema>): Promise<GoalResult> {
  const parsed = checkInSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're signed out. Sign in and try again." };

  const { data: goal } = await supabase
    .from("goals")
    .select("id, track_type, unit, is_private, status")
    .eq("id", v.goalId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!goal) return { ok: false, error: "That goal doesn't exist anymore." };
  if (goal.status === "done" || goal.status === "let_go") {
    return { ok: false, error: "This goal is closed. Reopen it to check in." };
  }
  if (goal.track_type === "feeling" && v.onTrack === null) {
    return { ok: false, error: "Pick how on track this feels, from 1 to 10." };
  }
  if (!v.note && v.value === null && v.onTrack === null) {
    return { ok: false, error: "Add a number, a rating, or a few words." };
  }

  const today = await todayIsoLocal();
  const summary = [
    v.value !== null ? `Now at ${formatValue(v.value, goal.unit)}.` : null,
    v.onTrack !== null ? `Feels ${v.onTrack} of 10.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const { error } = await supabase.from("journal_entries").insert({
    owner_id: user.id,
    entry_date: today,
    body: v.note || summary || "Checked in.",
    kind: "check_in",
    goal_id: goal.id,
    on_track: v.onTrack,
    value: v.value,
    // A check-in is as visible as the goal it belongs to.
    is_private: goal.is_private,
  });
  if (error) return { ok: false, error: "Couldn't save the check-in. Try again." };

  await supabase
    .from("goals")
    .update({
      last_checkin_on: today,
      ...(v.value !== null ? { current_value: v.value } : {}),
    })
    .eq("id", goal.id)
    .eq("owner_id", user.id);

  // Once per goal per week: checking in daily is fine, but it pays weekly.
  const weekStart = weekStartIsoOf(today, await getWeekStartDay());
  const xp = await awardXp(supabase, user.id, "goal_checkin", `${goal.id}:${weekStart}`);

  revalidatePath(`/goals/${goal.id}`);
  revalidatePath("/goals");
  revalidatePath("/dashboard");
  revalidatePath("/journal");
  return { ok: true, xp };
}
