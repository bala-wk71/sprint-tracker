import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  DEFAULT_WEEK_START_DAY,
  addDaysIso,
  weekStartIsoOf,
  type WeekStartDay,
} from "@/lib/week";

type Client = SupabaseClient<Database>;

export type StreakResult = { current: number; lastActiveDate: string | null };

function todayIso(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

export async function computeWeeklyStreak(
  supabase: Client,
  userId: string,
  weekStartDay: WeekStartDay = DEFAULT_WEEK_START_DAY
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

  const currentWeekStart = weekStartIsoOf(todayIso(), weekStartDay);

  // Exclude the current week sprint (in progress)
  const completedSprints = sprints.filter(
    (s) => s.week_start_date < currentWeekStart
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
  let cursor = completedSprints[0].week_start_date;
  let streak = 0;
  let lastActive: string | null = null;

  while (true) {
    const qualified = qualifiedWeeks.get(cursor);
    if (qualified === undefined || qualified === false) break;
    streak++;
    if (lastActive === null) lastActive = cursor;
    cursor = addDaysIso(cursor, -7);
  }

  return { current: streak, lastActiveDate: lastActive };
}
