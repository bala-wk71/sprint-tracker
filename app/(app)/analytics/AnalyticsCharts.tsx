"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CATEGORY_ORDER, TASK_CATEGORIES } from "@/lib/constants";

// CVD-validated per surface — keep in sync with the --viz-* vars in
// globals.css. Recharts writes SVG presentation attributes, which can't
// resolve CSS variables, so the hex lives here and swaps with the theme.
const PALETTES = {
  light: {
    strong_signal: "#1baf7a",
    weak_signal: "#eda100",
    personal: "#2a78d6",
    strong_noise: "#4a3aa7",
    weak_noise: "#e34948",
    untagged: "#898781",
    energy: "#eda100",
    primary: "#2a78d6",
    grid: "#e8e4da",
    axis: "#7d7466",
    surface: "#ffffff",
  },
  dark: {
    strong_signal: "#199e70",
    weak_signal: "#c98500",
    personal: "#3987e5",
    strong_noise: "#9085e9",
    weak_noise: "#e66767",
    untagged: "#898781",
    energy: "#c98500",
    primary: "#3987e5",
    grid: "#262f3d",
    axis: "#8b95a5",
    surface: "#161b22",
  },
} as const;

type DailyRow = {
  date: string;
  label: string;
  hours: number;
  productivity: number | null;
  energy: number | null;
};

type WeeklyRow = {
  label: string;
  strong_signal: number;
  weak_signal: number;
  personal: number;
  strong_noise: number;
  weak_noise: number;
  untagged: number;
  total: number;
};

type Props = {
  dailySeries: DailyRow[];
  weeklySeries: WeeklyRow[];
};

// Stack order matches SignalMeter: the action ladder (do first → do second →
// limit → eliminate), then personal, then untagged. The --viz-* palette was
// CVD-validated in exactly this adjacency.
const STACK_KEYS = [
  ...CATEGORY_ORDER,
  "untagged",
] as const;

// Labels come from TASK_CATEGORIES so a rename lands here too; `untagged` is
// local because it is a "no data" bucket rather than a category.
const CATEGORY_LABELS: Record<(typeof STACK_KEYS)[number], string> = {
  strong_signal: TASK_CATEGORIES.strong_signal.label,
  weak_signal: TASK_CATEGORIES.weak_signal.label,
  personal: TASK_CATEGORIES.personal.label,
  strong_noise: TASK_CATEGORIES.strong_noise.label,
  weak_noise: TASK_CATEGORIES.weak_noise.label,
  untagged: "Untagged",
};

const emptySubscribe = () => () => {};

export function AnalyticsCharts({ dailySeries, weeklySeries }: Props) {
  const { resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  // "colourful" has light surfaces, so it shares the light chart palette.
  const c = PALETTES[mounted && resolvedTheme === "dark" ? "dark" : "light"];

  const tooltipStyle = {
    backgroundColor: c.surface,
    border: `1px solid ${c.grid}`,
    borderRadius: "8px",
    fontSize: "12px",
  };
  const axisTick = { fill: c.axis, fontSize: 11 };

  const hasRatings = dailySeries.some(
    (d) => d.productivity !== null || d.energy !== null
  );
  const hasWeekly = weeklySeries.some((w) => w.total > 0);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Daily hours logged */}
      <ChartCard
        title="Daily hours"
        subtitle="Tracked time per day"
      >
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart
            data={dailySeries}
            margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="hoursFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c.primary} stopOpacity={0.3} />
                <stop offset="100%" stopColor={c.primary} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis
              dataKey="label"
              tick={axisTick}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              tick={axisTick}
              axisLine={false}
              tickLine={false}
              width={44}
              unit="h"
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={{ color: c.axis }}
              formatter={(value) => [`${Number(value).toFixed(1)}h`, "Hours"]}
            />
            <Area
              type="monotone"
              dataKey="hours"
              stroke={c.primary}
              strokeWidth={2}
              fill="url(#hoursFill)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Energy vs productivity — same 1–10 scale, one axis */}
      <ChartCard
        title="Energy vs productivity"
        subtitle="Morning energy and evening productivity, both rated 1–10"
      >
        {hasRatings ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart
              data={dailySeries}
              margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke={c.grid} vertical={false} />
              <XAxis
                dataKey="label"
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                width={36}
                domain={[0, 10]}
                ticks={[0, 5, 10]}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={{ color: c.axis }}
                formatter={(value, name) => [
                  `${value}/10`,
                  name === "energy" ? "Energy" : "Productivity",
                ]}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: c.axis }}
                formatter={(value: string) =>
                  value === "energy" ? "Energy (am)" : "Productivity (pm)"
                }
              />
              <Line
                type="monotone"
                dataKey="productivity"
                stroke={c.primary}
                strokeWidth={2}
                dot={{ r: 2.5, fill: c.primary, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="energy"
                stroke={c.energy}
                strokeWidth={2}
                dot={{ r: 2.5, fill: c.energy, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart message="Rate your mornings and evenings to see this." />
        )}
      </ChartCard>

      {/* Weekly hours by category */}
      <ChartCard
        title="Where the week went"
        subtitle="Hours by Signal/Noise category, stacked per week"
        className="lg:col-span-2"
      >
        {hasWeekly ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={weeklySeries}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              barCategoryGap="28%"
            >
              <CartesianGrid stroke={c.grid} vertical={false} />
              <XAxis
                dataKey="label"
                tick={axisTick}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                width={44}
                unit="h"
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={{ color: c.axis }}
                cursor={{ fill: c.grid, opacity: 0.3 }}
                formatter={(value, name) => [
                  `${Number(value).toFixed(1)}h`,
                  CATEGORY_LABELS[name as (typeof STACK_KEYS)[number]] ?? name,
                ]}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: c.axis }}
                formatter={(value: string) =>
                  CATEGORY_LABELS[value as (typeof STACK_KEYS)[number]] ?? value
                }
              />
              {STACK_KEYS.map((key) => (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId="cat"
                  fill={c[key]}
                  stroke={c.surface}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart message="Not enough weekly data yet." />
        )}
      </ChartCard>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border border-border bg-card p-4 sm:p-6 ${className ?? ""}`}
    >
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[240px] items-center justify-center rounded-md border border-dashed border-border">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
