// The few goals worth seeing every day: what the Daily Log and the one-screen
// Home show. Deliberately short — a long list of goals is its own problem.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { goalArea } from "./constants";
import { formatValue, goalProgress, isCheckinDue } from "./progress";

/** How many goals the daily surfaces show. Pinned first, then soonest to end. */
export const GLANCE_GOALS = 3;

export type GoalGlance = {
  id: string;
  title: string;
  /** Tailwind class for the area dot. */
  dot: string;
  /** 0–1, or null when there is nothing to measure yet. */
  progress: number | null;
  label: string;
  checkinDue: boolean;
};

export async function loadGoalsGlance(
  supabase: SupabaseClient<Database>,
  ownerId: string,
  todayIso: string,
  limit = GLANCE_GOALS
): Promise<{ goals: GoalGlance[]; total: number }> {
  const [{ data: rows }, { count }] = await Promise.all([
    supabase
      .from("goals")
      .select(
        "id, title, area, status, start_date, target_date, track_type, start_value, target_value, current_value, unit, checkin_every_days, last_checkin_on, goal_steps(done_at)"
      )
      .eq("owner_id", ownerId)
      .eq("status", "active")
      .order("pinned", { ascending: false })
      .order("target_date", { ascending: true })
      .limit(limit),
    supabase
      .from("goals")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId)
      .eq("status", "active"),
  ]);
  const goals = rows ?? [];

  // Latest rating for each feeling goal, in one query.
  const feelingIds = goals.filter((g) => g.track_type === "feeling").map((g) => g.id);
  const lastFeeling = new Map<string, number>();
  if (feelingIds.length > 0) {
    const { data: checkins } = await supabase
      .from("journal_entries")
      .select("goal_id, on_track")
      .in("goal_id", feelingIds)
      .not("on_track", "is", null)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(feelingIds.length * 10);
    for (const c of checkins ?? []) {
      if (!c.goal_id || c.on_track === null || lastFeeling.has(c.goal_id)) continue;
      lastFeeling.set(c.goal_id, c.on_track);
    }
  }

  return {
    total: count ?? goals.length,
    goals: goals.map((goal) => {
      const steps = goal.goal_steps ?? [];
      const stepsDone = steps.filter((s) => s.done_at).length;
      const feeling = lastFeeling.get(goal.id) ?? null;
      const label =
        goal.track_type === "steps"
          ? steps.length > 0
            ? `${stepsDone}/${steps.length} steps`
            : "No steps yet"
          : goal.track_type === "number"
            ? `${formatValue(goal.current_value ?? goal.start_value, null)} of ${formatValue(goal.target_value, goal.unit)}`
            : feeling !== null
              ? `Feels ${feeling}/10`
              : "No check-ins yet";
      return {
        id: goal.id,
        title: goal.title,
        dot: goalArea(goal.area).dot,
        progress: goalProgress(goal, {
          stepsDone,
          stepsTotal: steps.length,
          lastFeeling: feeling,
        }),
        label,
        checkinDue: isCheckinDue(goal, todayIso),
      };
    }),
  };
}
