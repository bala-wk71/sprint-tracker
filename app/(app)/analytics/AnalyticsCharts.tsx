"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Fixed HSL values matching CSS variables in globals.css so charts look
// consistent across light and dark themes.
const COLORS = {
  strong_signal: "hsl(140, 49%, 48%)",
  weak_signal: "hsl(40, 72%, 49%)",
  strong_noise: "hsl(0, 90%, 63%)",
  weak_noise: "hsl(269, 58%, 72%)",
  personal: "hsl(212, 92%, 67%)",
  untagged: "hsl(215, 14%, 45%)",
  primary: "hsl(213, 94%, 68%)",
  grid: "hsl(215, 14%, 30%)",
  axis: "hsl(214, 12%, 56%)",
} as const;

type DailyRow = {
  date: string;
  label: string;
  hours: number;
  productivity: number | null;
  energy: number | null;
};

type WeeklyRow = {
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

type CategoryRow = {
  key: string;
  label: string;
  hours: number;
};

type Props = {
  dailySeries: DailyRow[];
  weeklySeries: WeeklyRow[];
  categoryDistribution: CategoryRow[];
};

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "6px",
  color: "hsl(var(--foreground))",
  fontSize: "12px",
};

const axisTickStyle = {
  fill: COLORS.axis,
  fontSize: 11,
};

export function AnalyticsCharts({
  dailySeries,
  weeklySeries,
  categoryDistribution,
}: Props) {
  // Productivity series has holes for untracked days — Recharts LineChart
  // handles nulls natively with connectNulls={false}, so pass as-is.
  const productivityData = dailySeries.map((d) => ({
    label: d.label,
    productivity: d.productivity,
  }));

  const hasWeekly = weeklySeries.length > 0;
  const hasCategory = categoryDistribution.length > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Daily hours logged */}
      <ChartCard
        title="Daily hours logged"
        subtitle="Hours of tracked work per day"
        className="lg:col-span-2"
      >
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart
            data={dailySeries}
            margin={{ top: 8, right: 16, left: -8, bottom: 0 }}
          >
            <defs>
              <linearGradient id="hoursFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.primary} stopOpacity={0.35} />
                <stop offset="100%" stopColor={COLORS.primary} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={COLORS.grid}
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={axisTickStyle}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              tick={axisTickStyle}
              axisLine={false}
              tickLine={false}
              width={32}
              unit="h"
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={{ color: COLORS.axis }}
              formatter={(value) => [`${Number(value).toFixed(1)}h`, "Hours"]}
            />
            <Area
              type="monotone"
              dataKey="hours"
              stroke={COLORS.primary}
              strokeWidth={2}
              fill="url(#hoursFill)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Hours by category per week */}
      <ChartCard
        title="Hours by category per week"
        subtitle="Stacked by Signal/Noise category"
      >
        {hasWeekly ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={weeklySeries}
              margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={COLORS.grid}
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={axisTickStyle}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={axisTickStyle}
                axisLine={false}
                tickLine={false}
                width={32}
                unit="h"
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={{ color: COLORS.axis }}
                formatter={(value, name) => [
                  `${Number(value).toFixed(1)}h`,
                  categoryLabel(String(name)),
                ]}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: COLORS.axis }}
                formatter={(value: string) => categoryLabel(value)}
              />
              <Bar dataKey="strong_signal" stackId="cat" fill={COLORS.strong_signal} />
              <Bar dataKey="weak_signal" stackId="cat" fill={COLORS.weak_signal} />
              <Bar dataKey="strong_noise" stackId="cat" fill={COLORS.strong_noise} />
              <Bar dataKey="weak_noise" stackId="cat" fill={COLORS.weak_noise} />
              <Bar dataKey="personal" stackId="cat" fill={COLORS.personal} />
              <Bar dataKey="untagged" stackId="cat" fill={COLORS.untagged} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart message="Not enough weekly data yet." />
        )}
      </ChartCard>

      {/* Productivity trend */}
      <ChartCard
        title="Productivity trend"
        subtitle="Daily self-rated productivity (1–10)"
      >
        <ResponsiveContainer width="100%" height={260}>
          <LineChart
            data={productivityData}
            margin={{ top: 8, right: 16, left: -8, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={COLORS.grid}
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={axisTickStyle}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              tick={axisTickStyle}
              axisLine={false}
              tickLine={false}
              width={24}
              domain={[0, 10]}
              ticks={[0, 2, 4, 6, 8, 10]}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={{ color: COLORS.axis }}
              formatter={(value) => [`${value}/10`, "Productivity"]}
            />
            <Line
              type="monotone"
              dataKey="productivity"
              stroke={COLORS.primary}
              strokeWidth={2}
              dot={{ r: 3, fill: COLORS.primary, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Category distribution */}
      <ChartCard
        title="Time distribution"
        subtitle={`Total hours by category · last ${dailySeries.length} days`}
        className="lg:col-span-2"
      >
        {hasCategory ? (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, _name, entry) => {
                  const payload = (entry as unknown as { payload: CategoryRow })
                    .payload;
                  return [`${Number(value).toFixed(1)}h`, payload.label];
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: COLORS.axis }}
                formatter={(value: string) => value}
              />
              <Pie
                data={categoryDistribution}
                dataKey="hours"
                nameKey="label"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                isAnimationActive={false}
              >
                {categoryDistribution.map((row) => (
                  <Cell
                    key={row.key}
                    fill={COLORS[row.key as keyof typeof COLORS] ?? COLORS.untagged}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart message="No time logged yet." />
        )}
      </ChartCard>
    </div>
  );
}

function categoryLabel(key: string): string {
  switch (key) {
    case "strong_signal":
      return "Strong Signal";
    case "weak_signal":
      return "Weak Signal";
    case "strong_noise":
      return "Strong Noise";
    case "weak_noise":
      return "Weak Noise";
    case "personal":
      return "Personal";
    case "untagged":
      return "Untagged";
    default:
      return key;
  }
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
    <div className="flex h-[260px] items-center justify-center rounded-md border border-dashed border-border">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
