import { format, startOfWeek } from "date-fns";
import { createClient, getUser } from "@/lib/supabase/server";
import { WeekSummary } from "@/components/dashboard/WeekSummary";
import { StreakCards } from "@/components/dashboard/StreakCards";
import { computeDailyStreak, computeWeeklyStreak } from "@/lib/streaks";
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

  const [dailyStreak, weeklyStreak] = await Promise.all([
    computeDailyStreak(supabase, user.id),
    computeWeeklyStreak(supabase, user.id),
  ]);

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
      <StreakCards daily={dailyStreak} weekly={weeklyStreak} />
      <WeekSummary
        ownerId={user.id}
        weekStart={weekStart}
        revalidatePath="/dashboard"
      />
    </div>
  );
}
