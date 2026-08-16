import Link from "next/link";
import { format, subDays } from "date-fns";
import { createClient, getUser } from "@/lib/supabase/server";
import type { TaskCategory } from "@/lib/constants";
import { getWeekStartDay, todayIsoLocal } from "@/lib/dates";
import { weekStartIsoOf } from "@/lib/week";
import { AnalyticsCharts } from "./AnalyticsCharts";
import { SignalMeter } from "./SignalMeter";
import { ConsistencyHeatmap, type HeatmapDay } from "./ConsistencyHeatmap";
import { InsightsPanel, type Insight } from "./InsightsPanel";

export const dynamic = "force-dynamic";

const RANGES = [7, 28, 84] as const;
type RangeDays = (typeof RANGES)[number];

type SearchParams = Promise<{ days?: string }>;

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

type CategoryHours = Record<TaskCategory | "untagged", number>;

const emptyByCategory = (): CategoryHours => ({
  strong_signal: 0,
  weak_signal: 0,
  strong_noise: 0,
  weak_noise: 0,
  personal: 0,
  untagged: 0,
});

/** Signal share of tagged work time: signal / (signal + noise), personal excluded. */
function signalShare(c: CategoryHours): number | null {
  const signal = c.strong_signal + c.weak_signal;
  const noise = c.strong_noise + c.weak_noise;
  const denom = signal + noise;
  return denom > 0 ? signal / denom : null;
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const windowDays: RangeDays = RANGES.includes(Number(params.days) as RangeDays)
    ? (Number(params.days) as RangeDays)
    : 28;

  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const todayIso = await todayIsoLocal();
  const weekStartDay = await getWeekStartDay();
  const startIso = format(
    subDays(new Date(`${todayIso}T00:00:00`), windowDays - 1),
    "yyyy-MM-dd"
  );
  // Fetch a second, equal window before this one for trend comparisons.
  const prevStartIso = format(
    subDays(new Date(`${todayIso}T00:00:00`), windowDays * 2 - 1),
    "yyyy-MM-dd"
  );

  const { data: allLogs } = await supabase
    .from("daily_logs")
    .select(
      "id, log_date, productivity_rating, morning_energy, time_entries(duration_hours, tasks(category))"
    )
    .eq("owner_id", user.id)
    .gte("log_date", prevStartIso)
    .lte("log_date", todayIso)
    .order("log_date", { ascending: true });

  type DayAgg = {
    hours: number;
    productivity: number | null;
    energy: number | null;
    byCategory: CategoryHours;
  };

  const dayMap = new Map<string, DayAgg>();
  for (const log of allLogs ?? []) {
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
      agg.byCategory[cat ?? "untagged"] += hrs;
    }
    dayMap.set(log.log_date, agg);
  }

  // Current-window daily series (gaps filled).
  const dailySeries: Array<{
    date: string;
    label: string;
    hours: number;
    productivity: number | null;
    energy: number | null;
  }> = [];
  for (let i = 0; i < windowDays; i++) {
    const date = addDaysIso(startIso, i);
    const agg = dayMap.get(date);
    dailySeries.push({
      date,
      label: format(new Date(`${date}T00:00:00`), "MMM d"),
      hours: agg?.hours ?? 0,
      productivity: agg?.productivity ?? null,
      energy: agg?.energy ?? null,
    });
  }

  // Category totals for both windows.
  const categoryTotals = emptyByCategory();
  const prevCategoryTotals = emptyByCategory();
  for (const [date, agg] of dayMap) {
    const target = date >= startIso ? categoryTotals : prevCategoryTotals;
    for (const key of Object.keys(agg.byCategory) as (keyof CategoryHours)[]) {
      target[key] += agg.byCategory[key];
    }
  }
  const grandTotal = Object.values(categoryTotals).reduce((a, b) => a + b, 0);

  // Weekly stacked series (current window only).
  type WeekAgg = CategoryHours & { weekStart: string; label: string; total: number };
  const weekMap = new Map<string, WeekAgg>();
  for (const row of dailySeries) {
    const bucket = weekStartIsoOf(row.date, weekStartDay);
    let week = weekMap.get(bucket);
    if (!week) {
      week = {
        ...emptyByCategory(),
        weekStart: bucket,
        label: format(new Date(`${bucket}T00:00:00`), "MMM d"),
        total: 0,
      };
      weekMap.set(bucket, week);
    }
    const agg = dayMap.get(row.date);
    if (agg) {
      for (const key of Object.keys(agg.byCategory) as (keyof CategoryHours)[]) {
        week[key] += agg.byCategory[key];
      }
      week.total += agg.hours;
    }
  }
  const weeklySeries = Array.from(weekMap.values()).sort((a, b) =>
    a.weekStart.localeCompare(b.weekStart)
  );

  // Heatmap: pad back to the first day of the week containing startIso, so
  // every column is a full week on the user's own calendar.
  const heatmapStart = weekStartIsoOf(startIso, weekStartDay);
  const heatmapDays: HeatmapDay[] = [];
  for (let d = heatmapStart; d <= todayIso; d = addDaysIso(d, 1)) {
    heatmapDays.push({
      date: d,
      hours: dayMap.get(d)?.hours ?? 0,
      inWindow: d >= startIso,
      logged: dayMap.has(d),
    });
  }

  // Headline stats.
  const productivitySamples = dailySeries
    .map((d) => d.productivity)
    .filter((v): v is number => typeof v === "number");
  const avgProductivity =
    productivitySamples.length > 0
      ? productivitySamples.reduce((a, b) => a + b, 0) / productivitySamples.length
      : null;
  const activeDays = dailySeries.filter((d) => d.hours > 0).length;
  const loggedDays = dailySeries.filter((d) => dayMap.has(d.date)).length;

  const share = signalShare(categoryTotals);
  const prevShare = signalShare(prevCategoryTotals);

  // ---- Insights ---------------------------------------------------------
  const insights: Insight[] = [];

  const prevLoggedDays = Array.from(dayMap.keys()).filter(
    (d) => d < startIso
  ).length;
  insights.push({
    icon: "CalendarCheck",
    text: `You logged ${loggedDays} of the last ${windowDays} days (${Math.round((loggedDays / windowDays) * 100)}%).`,
    tone:
      loggedDays >= prevLoggedDays
        ? loggedDays > 0
          ? "good"
          : "neutral"
        : "warn",
  });

  if (share !== null && prevShare !== null) {
    const delta = Math.round((share - prevShare) * 100);
    if (delta !== 0) {
      insights.push({
        icon: delta > 0 ? "TrendingUp" : "TrendingDown",
        text: `Signal share is ${delta > 0 ? "up" : "down"} ${Math.abs(delta)} points vs the previous ${windowDays} days.`,
        tone: delta > 0 ? "good" : "warn",
      });
    }
  }

  // Strongest weekday by average hours (needs 2+ samples on that weekday).
  const byWeekday = new Map<number, { total: number; n: number }>();
  for (const row of dailySeries) {
    if (row.hours <= 0) continue;
    const wd = new Date(`${row.date}T00:00:00`).getDay();
    const cur = byWeekday.get(wd) ?? { total: 0, n: 0 };
    cur.total += row.hours;
    cur.n++;
    byWeekday.set(wd, cur);
  }
  let bestDay: { wd: number; avg: number } | null = null;
  for (const [wd, { total, n }] of byWeekday) {
    if (n < 2) continue;
    const avg = total / n;
    if (!bestDay || avg > bestDay.avg) bestDay = { wd, avg };
  }
  if (bestDay) {
    const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][bestDay.wd];
    insights.push({
      icon: "Trophy",
      text: `${dayName} is your strongest day — ${bestDay.avg.toFixed(1)}h logged on average.`,
      tone: "good",
    });
  }

  // Energy → productivity link (needs 3+ samples on each side).
  const highE: number[] = [];
  const lowE: number[] = [];
  for (const row of dailySeries) {
    if (row.energy === null || row.productivity === null) continue;
    (row.energy >= 6 ? highE : lowE).push(row.productivity);
  }
  if (highE.length >= 3 && lowE.length >= 3) {
    const avgH = highE.reduce((a, b) => a + b, 0) / highE.length;
    const avgL = lowE.reduce((a, b) => a + b, 0) / lowE.length;
    if (Math.abs(avgH - avgL) >= 0.5) {
      insights.push({
        icon: "Zap",
        text: `High-energy mornings (6+) average ${avgH.toFixed(1)}/10 productivity vs ${avgL.toFixed(1)}/10 on low-energy days.`,
        tone: "neutral",
      });
    }
  }

  const hasAnyData = grandTotal > 0 || productivitySamples.length > 0 || loggedDays > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
          <p className="text-muted-foreground">
            How you actually spend your time — and whether it&apos;s signal.
          </p>
        </div>
        {/* Range filter row — scopes every card below. */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={r === 28 ? "/analytics" : `/analytics?days=${r}`}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                r === windowDays
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {r === 7 ? "7 days" : r === 28 ? "4 weeks" : "12 weeks"}
            </Link>
          ))}
        </div>
      </div>

      {/* Headline stat tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <HeadlineCard
          label="Total hours"
          value={`${grandTotal.toFixed(1)}h`}
          sub={`last ${windowDays} days`}
        />
        <HeadlineCard
          label="Active days"
          value={`${activeDays}`}
          sub={`of ${windowDays} with time logged`}
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

      {!hasAnyData ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No data yet in the last {windowDays} days. Log a few days to see
            your patterns here.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <SignalMeter
              categories={categoryTotals}
              share={share}
              prevShare={prevShare}
            />
            <InsightsPanel insights={insights} />
          </div>

          <ConsistencyHeatmap days={heatmapDays} weekStartDay={weekStartDay} />

          <AnalyticsCharts
            dailySeries={dailySeries}
            weeklySeries={weeklySeries.map((w) => ({
              label: w.label,
              strong_signal: w.strong_signal,
              weak_signal: w.weak_signal,
              personal: w.personal,
              strong_noise: w.strong_noise,
              weak_noise: w.weak_noise,
              untagged: w.untagged,
              total: w.total,
            }))}
          />
        </>
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
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
