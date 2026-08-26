import Link from "next/link";
import { format } from "date-fns";
import {
  Droplet,
  Dumbbell,
  Flame,
  Scale,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { createClient, getUser } from "@/lib/supabase/server";
import { todayIsoLocal } from "@/lib/dates";
import { readHealthProfile } from "@/lib/health/profile";
import {
  formatWeight,
  kgToDisplay,
  ratePerWeek,
  sumMacros,
  ZERO_MACROS,
  type DatedValue,
} from "@/lib/health/units";
import { computeShieldedStreak } from "@/lib/gamification";
import { WaterCard } from "@/components/health/WaterCard";
import { MacroTotals } from "@/components/health/MacroTotals";
import { ProgressReport } from "@/components/health/ProgressReport";

const CARD = "rounded-xl border border-border bg-card p-4";

function shiftIso(date: string, days: number): string {
  return format(
    new Date(Date.parse(`${date}T00:00:00`) + days * 86_400_000),
    "yyyy-MM-dd"
  );
}

export default async function HealthOverviewPage() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const todayIso = await todayIsoLocal();
  const weekAgo = shiftIso(todayIso, -6);
  const ninetyDaysAgo = shiftIso(todayIso, -90);

  const [
    profile,
    { data: water },
    { data: todayMeals },
    { data: weekWorkouts },
    { data: bodyRows },
    { data: streakWater },
    { data: streakWorkouts },
  ] = await Promise.all([
    readHealthProfile(supabase, user.id),
    supabase
      .from("water_logs")
      .select("id, amount_ml")
      .eq("owner_id", user.id)
      .eq("log_date", todayIso)
      .order("logged_at"),
    supabase
      .from("meals")
      .select("id")
      .eq("owner_id", user.id)
      .eq("log_date", todayIso)
      .eq("is_template", false),
    supabase
      .from("workouts")
      .select("id, log_date, name")
      .eq("owner_id", user.id)
      .gte("log_date", weekAgo)
      .lte("log_date", todayIso)
      .order("log_date", { ascending: false }),
    supabase
      .from("body_metrics")
      .select("measured_on, weight_kg")
      .eq("owner_id", user.id)
      .gte("measured_on", ninetyDaysAgo)
      .not("weight_kg", "is", null)
      .order("measured_on"),
    supabase
      .from("water_logs")
      .select("log_date, amount_ml")
      .eq("owner_id", user.id)
      .gte("log_date", ninetyDaysAgo),
    supabase
      .from("workouts")
      .select("log_date")
      .eq("owner_id", user.id)
      .gte("log_date", ninetyDaysAgo),
  ]);

  const waterByDate = new Map<string, number>();
  for (const row of streakWater ?? [])
    waterByDate.set(
      row.log_date,
      (waterByDate.get(row.log_date) ?? 0) + row.amount_ml
    );

  const mealIds = (todayMeals ?? []).map((m) => m.id);
  const { data: items } =
    mealIds.length > 0
      ? await supabase
          .from("meal_items")
          .select("kcal, protein_g, carbs_g, fat_g, fiber_g")
          .in("meal_id", mealIds)
      : { data: [] as never[] };

  const totals =
    (items ?? []).length > 0
      ? sumMacros(
          (items ?? []).map((i) => ({
            kcal: Number(i.kcal),
            protein_g: Number(i.protein_g),
            carbs_g: Number(i.carbs_g),
            fat_g: Number(i.fat_g),
            fiber_g: Number(i.fiber_g),
          }))
        )
      : { ...ZERO_MACROS };

  const workoutsThisWeek = (weekWorkouts ?? []).length;
  const lastWorkout = weekWorkouts?.[0] ?? null;

  // Streaks reuse the same shielded counter as the daily log rather than a
  // second engine: a missed day spends a banked shield instead of wiping the
  // run, which is the whole reason the streak survives a bad week.
  const waterGoalDates = [...waterByDate.entries()]
    .filter(([, ml]) => ml >= profile.daily_water_ml_goal)
    .map(([date]) => date)
    .sort();
  const workoutDates = [
    ...new Set((streakWorkouts ?? []).map((w) => w.log_date)),
  ].sort();

  const waterStreak = computeShieldedStreak(waterGoalDates, todayIso);
  const workoutStreak = computeShieldedStreak(workoutDates, todayIso);

  const points: DatedValue[] = (bodyRows ?? []).map((r) => ({
    date: r.measured_on,
    value: r.weight_kg as number,
  }));
  const currentKg = points.length > 0 ? points[points.length - 1].value : null;
  const rate = ratePerWeek(points.slice(-30));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <WaterCard
          logDate={todayIso}
          entries={water ?? []}
          goalMl={profile.daily_water_ml_goal}
          volumeUnit={profile.volume_unit}
        />
        <MacroTotals
          totals={totals}
          kcalGoal={profile.daily_kcal_goal}
          proteinGoal={profile.daily_protein_g_goal}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <StreakPill
          icon={<Dumbbell className="h-3.5 w-3.5" />}
          label="training"
          days={workoutStreak.current}
          shields={workoutStreak.shields}
        />
        <StreakPill
          icon={<Droplet className="h-3.5 w-3.5" />}
          label="water"
          days={waterStreak.current}
          shields={waterStreak.shields}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* ------------------------------------------------------- training */}
        <Link href="/health/train" className={`${CARD} block hover:bg-accent`}>
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Dumbbell className="h-3.5 w-3.5" />
            This week
          </p>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {workoutsThisWeek}
            <span className="text-base font-medium text-muted-foreground">
              {" "}
              / {profile.weekly_workout_goal}
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {lastWorkout
              ? `Last: ${lastWorkout.name ?? "session"} on ${format(
                  new Date(`${lastWorkout.log_date}T00:00:00`),
                  "EEE d MMM"
                )}`
              : "Nothing logged in the last 7 days."}
          </p>
        </Link>

        {/* --------------------------------------------------------- weight */}
        <Link href="/health/body" className={`${CARD} block hover:bg-accent`}>
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Scale className="h-3.5 w-3.5" />
            Weight
          </p>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {currentKg === null
              ? "—"
              : formatWeight(currentKg, profile.weight_unit)}
          </p>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            {rate === null ? (
              "Needs a few more readings to show a trend."
            ) : (
              <>
                {rate > 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {rate > 0 ? "+" : ""}
                {kgToDisplay(rate, profile.weight_unit).toFixed(2)}{" "}
                {profile.weight_unit}/week over 30 days
              </>
            )}
          </p>
        </Link>

        {/* ----------------------------------------------------------- food */}
        <Link href="/health/eat" className={`${CARD} block hover:bg-accent`}>
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Flame className="h-3.5 w-3.5" />
            Eaten today
          </p>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {Math.round(totals.kcal)}
            <span className="text-base font-medium text-muted-foreground">
              {" "}
              kcal
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {mealIds.length === 0
              ? "Nothing logged yet."
              : `${mealIds.length} meal${mealIds.length === 1 ? "" : "s"} · ${Math.round(
                  totals.protein_g
                )}g protein`}
          </p>
        </Link>
      </div>

      <ProgressReport />
    </div>
  );
}

function StreakPill({
  icon,
  label,
  days,
  shields,
}: {
  icon: React.ReactNode;
  label: string;
  days: number;
  shields: number;
}) {
  return (
    <span
      title={
        shields > 0
          ? `${shields} shield${shields === 1 ? "" : "s"} banked — a missed day spends one instead of resetting the streak.`
          : undefined
      }
      className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground"
    >
      {icon}
      <span className="font-semibold text-foreground">{days}</span>
      day {label} streak
      {shields > 0 && (
        <span className="text-primary">
          · {shields} shield{shields === 1 ? "" : "s"}
        </span>
      )}
    </span>
  );
}
