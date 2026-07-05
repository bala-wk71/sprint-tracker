import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { format, startOfWeek } from "date-fns";

type Client = SupabaseClient<Database>;

export type StreakResult = { current: number; lastActiveDate: string | null };

function mondayIsoOf(date: Date): string {
  return format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

export async function computeWeeklyStreak(
  supabase: Client,
  userId: string
): Promise<StreakResult> {
  // Fetch last 20 sprints with their tasks and time entries
  const { data: sprints } = await supabase
    .from("sprints")
    .select(
      `
      id,
      week_start_date,
      tasks (
        id,
        target_hours,
        time_entries ( duration_hours )
      )
    `
    )
    .eq("owner_id", userId)
    .order("week_start_date", { ascending: false })
    .limit(20);

  if (!sprints || sprints.length === 0) return { current: 0, lastActiveDate: null };

  const currentWeekMonday = mondayIsoOf(new Date());

  // Exclude the current week sprint (in progress)
  const completedSprints = sprints.filter(
    (s) => s.week_start_date < currentWeekMonday
  );

  if (completedSprints.length === 0) return { current: 0, lastActiveDate: null };

  // Build a map of week_start_date -> qualified
  const qualifiedWeeks = new Map<string, boolean>();
  for (const sprint of completedSprints) {
    const tasks = sprint.tasks ?? [];
    if (tasks.length === 0) {
      qualifiedWeeks.set(sprint.week_start_date, false);
      continue;
    }
    const allMet = tasks.every((t) => {
      const actual = (t.time_entries ?? []).reduce(
        (sum, e) => sum + (e.duration_hours ?? 0),
        0
      );
      return actual >= 0.5 * t.target_hours;
    });
    qualifiedWeeks.set(sprint.week_start_date, allMet);
  }

  // Walk backward week-by-week from the most recent completed sprint
  const mostRecentMonday = completedSprints[0].week_start_date;
  let cursor = mostRecentMonday;
  let streak = 0;
  let lastActive: string | null = null;

  while (true) {
    const qualified = qualifiedWeeks.get(cursor);
    if (qualified === undefined || qualified === false) break;
    streak++;
    if (lastActive === null) lastActive = cursor;
    // Move to the previous Monday
    const prev = new Date(`${cursor}T00:00:00`);
    prev.setDate(prev.getDate() - 7);
    cursor = prev.toISOString().slice(0, 10);
  }

  return { current: streak, lastActiveDate: lastActive };
}
