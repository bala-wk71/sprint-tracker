import { format, startOfWeek, subDays } from "date-fns";
import { createClient, getUser } from "@/lib/supabase/server";
import { TASK_CATEGORIES, type TaskCategory } from "@/lib/constants";
import { AnalyticsCharts } from "./AnalyticsCharts";

export const dynamic = "force-dynamic";

// Rolling window size in days.
const WINDOW_DAYS = 28;

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayIsoLocal(): string {
  const now = new Date();
  const tz = now.getTimezoneOffset();
  return new Date(now.getTime() - tz * 60 * 1000).toISOString().slice(0, 10);
}

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const todayIso = todayIsoLocal();
  const startIso = format(subDays(new Date(`${todayIso}T00:00:00`), WINDOW_DAYS - 1), "yyyy-MM-dd");

  // Pull all daily logs in the window, each with its time entries joined to
  // the task (for category), plus the per-day productivity rating.
  const { data: dailyLogs } = await supabase
    .from("daily_logs")
    .select(
      "id, log_date, productivity_rating, morning_energy, time_entries(duration_hours, tasks(category))"
    )
    .eq("owner_id", user.id)
    .gte("log_date", startIso)
    .lte("log_date", todayIso)
    .order("log_date", { ascending: true });

  // Build a lookup: date -> { hours, productivity, energy, byCategory }
  type DayAgg = {
    hours: number;
    productivity: number | null;
    energy: number | null;
    byCategory: Record<TaskCategory | "untagged", number>;
  };
  const emptyByCategory = (): DayAgg["byCategory"] => ({
    strong_signal: 0,
    weak_signal: 0,
    strong_noise: 0,
    weak_noise: 0,
    personal: 0,
    untagged: 0,
  });

  const dayMap = new Map<string, DayAgg>();

  for (const log of dailyLogs ?? []) {
    const agg: DayAgg = {
      hours: 0,
      productivity: log.productivity_rating,
      energy: log.morning_energy,
      byCategory: emptyByCategory(),
    };
    for (const entry of log.time_entries ?? []) {
      const hrs = Number(entry.duration_hours) || 0;
      agg.hours += hrs;
      const task = Array.isArray(entry.tasks) ? entry.tasks[0] : entry.tasks;
      const cat = (task?.category ?? null) as TaskCategory | null;
      if (cat) {
        agg.byCategory[cat] += hrs;
      } else {
        agg.byCategory.untagged += hrs;
      }
    }
    dayMap.set(log.log_date, agg);
  }

  // Daily series covering the whole window (fill gaps).
  const dailySeries: Array<{
    date: string;
    label: string;
    hours: number;
    productivity: number | null;
    energy: number | null;
  }> = [];

  for (let i = 0; i < WINDOW_DAYS; i++) {
    const date = addDaysIso(startIso, i);
    const agg = dayMap.get(date);
    const d = new Date(`${date}T00:00:00`);
    dailySeries.push({
      date,
      label: format(d, "MMM d"),
      hours: agg?.hours ?? 0,
      productivity: agg?.productivity ?? null,
      energy: agg?.energy ?? null,
    });
  }

  // Weekly buckets: group by Monday-of-week.
  type WeekAgg = {
    weekStart: string;
    label: string;
    strong_signal: number;
    weak_signal: number;
    strong_noise: number;
    weak_noise: number;
    personal: number;
    untagged: number;
    total: number;
  };
  const weekMap = new Map<string, WeekAgg>();

  for (const row of dailySeries) {
    const monday = format(
      startOfWeek(new Date(`${row.date}T00:00:00`), { weekStartsOn: 1 }),
      "yyyy-MM-dd"
    );
    let week = weekMap.get(monday);
    if (!week) {
      week = {
        weekStart: monday,
        label: `Week of ${format(new Date(`${monday}T00:00:00`), "MMM d")}`,
        strong_signal: 0,
        weak_signal: 0,
        strong_noise: 0,
        weak_noise: 0,
        personal: 0,
        untagged: 0,
        total: 0,
      };
      weekMap.set(monday, week);
    }
    const agg = dayMap.get(row.date);
    if (agg) {
      week.strong_signal += agg.byCategory.strong_signal;
      week.weak_signal += agg.byCategory.weak_signal;
      week.strong_noise += agg.byCategory.strong_noise;
      week.weak_noise += agg.byCategory.weak_noise;
      week.personal += agg.byCategory.personal;
      week.untagged += agg.byCategory.untagged;
      week.total += agg.hours;
    }
  }

  const weeklySeries = Array.from(weekMap.values()).sort((a, b) =>
    a.weekStart.localeCompare(b.weekStart)
  );

  // Category totals for the donut.
  const categoryTotals: Record<TaskCategory | "untagged", number> = emptyByCategory();
  for (const week of weeklySeries) {
    categoryTotals.strong_signal += week.strong_signal;
    categoryTotals.weak_signal += week.weak_signal;
    categoryTotals.strong_noise += week.strong_noise;
    categoryTotals.weak_noise += week.weak_noise;
    categoryTotals.personal += week.personal;
    categoryTotals.untagged += week.untagged;
  }
  const grandTotal = Object.values(categoryTotals).reduce((a, b) => a + b, 0);

  const categoryDistribution: Array<{ key: string; label: string; hours: number }> = (
    Object.keys(TASK_CATEGORIES) as TaskCategory[]
  )
    .map((cat) => ({
      key: cat as string,
      label: TASK_CATEGORIES[cat].label as string,
      hours: categoryTotals[cat],
    }))
    .filter((row) => row.hours > 0);

  if (categoryTotals.untagged > 0) {
    categoryDistribution.push({
      key: "untagged",
      label: "Untagged",
      hours: categoryTotals.untagged,
    });
  }

  // Headline totals.
  const productivitySamples = dailySeries
    .map((d) => d.productivity)
    .filter((v): v is number => typeof v === "number");
  const avgProductivity =
    productivitySamples.length > 0
      ? productivitySamples.reduce((a, b) => a + b, 0) / productivitySamples.length
      : null;
  const activeDays = dailySeries.filter((d) => d.hours > 0).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-muted-foreground">
          Trends and insights across the last {WINDOW_DAYS} days.
        </p>
      </div>

      {/* Headline cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <HeadlineCard
          label="Total hours"
          value={`${grandTotal.toFixed(1)}h`}
          sub={`${WINDOW_DAYS}-day window`}
        />
        <HeadlineCard
          label="Active days"
          value={`${activeDays}`}
          sub={`of ${WINDOW_DAYS} with time logged`}
        />
        <HeadlineCard
          label="Avg productivity"
          value={avgProductivity !== null ? `${avgProductivity.toFixed(1)}/10` : "—"}
          sub={
            productivitySamples.length > 0
              ? `${productivitySamples.length} day${productivitySamples.length === 1 ? "" : "s"} rated`
              : "no data yet"
          }
        />
        <HeadlineCard
          label="Avg hours/active day"
          value={activeDays > 0 ? `${(grandTotal / activeDays).toFixed(1)}h` : "—"}
          sub="excluding empty days"
        />
      </div>

      {grandTotal === 0 && productivitySamples.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No data yet in the last {WINDOW_DAYS} days. Log a few days to see
            charts here.
          </p>
        </div>
      ) : (
        <AnalyticsCharts
          dailySeries={dailySeries}
          weeklySeries={weeklySeries}
          categoryDistribution={categoryDistribution}
        />
      )}
    </div>
  );
}

function HeadlineCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
