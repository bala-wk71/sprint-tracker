import { format, startOfWeek } from "date-fns";
import { createClient, getUser } from "@/lib/supabase/server";
import { WeekSummary } from "@/components/dashboard/WeekSummary";
import { GamificationHero } from "@/components/dashboard/GamificationHero";
import { AchievementsPanel } from "@/components/dashboard/AchievementsPanel";
import { AchievementSync } from "@/components/dashboard/AchievementSync";
import { computeWeeklyStreak } from "@/lib/streaks";
import {
  computeShieldedStreak,
  levelFromXp,
  type GamificationStats,
} from "@/lib/gamification";
import { WeekNav } from "./WeekNav";

type SearchParams = Promise<{ week?: string }>;

function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function mondayIsoOf(date: Date): string {
  return format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const currentWeekStart = mondayIsoOf(new Date());
  const weekStart =
    params.week && isValidIsoDate(params.week)
      ? mondayIsoOf(new Date(`${params.week}T00:00:00`))
      : currentWeekStart;

  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const todayIso = new Date().toISOString().slice(0, 10);

  const [
    { data: totalXp },
    { data: statsRaw },
    { data: achievementRows },
    { data: todayLog },
    weeklyStreak,
  ] = await Promise.all([
    supabase.rpc("total_xp"),
    supabase.rpc("gamification_stats"),
    supabase.from("user_achievements").select("achievement_id"),
    supabase
      .from("daily_logs")
      .select(
        "morning_mood, morning_energy, closing_mood, productivity_rating, time_entries(id)"
      )
      .eq("owner_id", user.id)
      .eq("log_date", todayIso)
      .limit(1, { referencedTable: "time_entries" })
      .maybeSingle(),
    computeWeeklyStreak(supabase, user.id),
  ]);

  const stats = (statsRaw ?? {
    log_dates: [],
    total_hours: 0,
    priorities_done: 0,
    sprints_count: 0,
    reflections_count: 0,
  }) as unknown as GamificationStats;

  const level = levelFromXp(Number(totalXp ?? 0));
  const dailyStreak = computeShieldedStreak(stats.log_dates, todayIso);
  const today = {
    checkin: Boolean(
      todayLog && (todayLog.morning_mood || todayLog.morning_energy !== null)
    ),
    timeLogged: Boolean(todayLog && (todayLog.time_entries?.length ?? 0) > 0),
    wrapup: Boolean(
      todayLog &&
        (todayLog.closing_mood || todayLog.productivity_rating !== null)
    ),
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">
            Your weekly sprint overview at a glance.
          </p>
        </div>
        <WeekNav weekStart={weekStart} currentWeekStart={currentWeekStart} />
      </div>
      <GamificationHero
        level={level}
        daily={dailyStreak}
        weekly={weeklyStreak}
        today={today}
      />
      <WeekSummary
        ownerId={user.id}
        weekStart={weekStart}
        revalidatePath="/dashboard"
      />
      <AchievementsPanel
        unlockedIds={(achievementRows ?? []).map((r) => r.achievement_id)}
      />
      <AchievementSync />
    </div>
  );
}
