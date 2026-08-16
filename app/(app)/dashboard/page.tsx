import { createClient, getUser } from "@/lib/supabase/server";
import { getWeekStartDay, todayIsoLocal } from "@/lib/dates";
import { weekEndIsoOf, weekStartIsoOf } from "@/lib/week";
import { WeekSummary } from "@/components/dashboard/WeekSummary";
import { GamificationHero } from "@/components/dashboard/GamificationHero";
import { AchievementsPanel } from "@/components/dashboard/AchievementsPanel";
import { AchievementSync } from "@/components/dashboard/AchievementSync";
import { WagerCard, type WagerSummary } from "@/components/dashboard/WagerCard";
import { MascotOverlay } from "@/components/dashboard/MascotOverlay";
import { computeWeeklyStreak } from "@/lib/streaks";
import {
  computeShieldedStreak,
  levelFromXp,
  wagerPlacementOpen,
  type GamificationStats,
} from "@/lib/gamification";
import { WeekNav } from "./WeekNav";

type SearchParams = Promise<{ week?: string }>;

function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const todayIso = await todayIsoLocal();
  const weekStartDay = await getWeekStartDay();
  const currentWeekStart = weekStartIsoOf(todayIso, weekStartDay);
  const weekStart =
    params.week && isValidIsoDate(params.week)
      ? weekStartIsoOf(params.week, weekStartDay)
      : currentWeekStart;

  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const [
    { data: totalXp },
    { data: statsRaw },
    { data: achievementRows },
    { data: todayLog },
    { count: todosDoneToday },
    weeklyStreak,
    { data: wagerRow },
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
    supabase
      .from("todo_tasks")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .eq("is_completed", true)
      .gte("completed_at", `${todayIso}T00:00:00Z`),
    computeWeeklyStreak(supabase, user.id, weekStartDay),
    supabase
      .from("xp_wagers")
      .select("stake, status")
      .eq("owner_id", user.id)
      .eq("week_start", currentWeekStart)
      .maybeSingle(),
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
  const weekEndIso = weekEndIsoOf(currentWeekStart);
  const weekLoggedDates = stats.log_dates.filter(
    (d) => d >= currentWeekStart && d <= weekEndIso
  );
  const wager = (wagerRow as WagerSummary | null) ?? null;
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
        todosDoneToday={todosDoneToday ?? 0}
      />
      <WagerCard
        weekStart={currentWeekStart}
        todayIso={todayIso}
        wager={wager}
        totalXp={Number(totalXp ?? 0)}
        placementOpen={wagerPlacementOpen(currentWeekStart, todayIso)}
        weekStartDay={weekStartDay}
        weekLoggedDates={weekLoggedDates}
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
      <MascotOverlay />
    </div>
  );
}
