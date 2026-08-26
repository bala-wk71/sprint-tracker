"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { format } from "date-fns";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  kgToDisplay,
  movingAverage,
  type WeightUnit,
  type DatedValue,
} from "@/lib/health/units";
import type { BodyRow } from "./BodyLogger";

// Recharts writes SVG presentation attributes, which can't resolve CSS
// variables, so the hex lives here and swaps with the theme. Keep in sync with
// the --viz-* vars in globals.css.
const PALETTES = {
  light: {
    weight: "#2a78d6",
    trend: "#4a3aa7",
    fat: "#e34948",
    muscle: "#1baf7a",
    grid: "#e8e4da",
    axis: "#7d7466",
    surface: "#ffffff",
  },
  dark: {
    weight: "#3987e5",
    trend: "#9085e9",
    fat: "#e66767",
    muscle: "#199e70",
    grid: "#262f3d",
    axis: "#8b95a5",
    surface: "#161b22",
  },
} as const;

const RANGES = [
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
  { days: 365, label: "1y" },
  { days: 0, label: "All" },
] as const;

const emptySubscribe = () => () => {};

export function BodyCharts({
  entries,
  weightUnit,
  todayIso,
}: {
  /** Oldest first. */
  entries: BodyRow[];
  weightUnit: WeightUnit;
  /** Passed in rather than read from the clock: rendering must not depend on
   *  when it happens to run, and the server already knows the viewer's day. */
  todayIso: string;
}) {
  const { resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  // "colourful" has light surfaces, so it shares the light chart palette.
  const c = PALETTES[mounted && resolvedTheme === "dark" ? "dark" : "light"];

  const [rangeDays, setRangeDays] = useState<number>(90);

  const windowed = useMemo(() => {
    if (rangeDays === 0) return entries;
    const cutoff =
      Date.parse(`${todayIso}T00:00:00`) - rangeDays * 86_400_000;
    return entries.filter(
      (e) => Date.parse(`${e.measured_on}T00:00:00`) >= cutoff
    );
  }, [entries, rangeDays, todayIso]);

  const weightSeries = useMemo(() => {
    const points: DatedValue[] = windowed
      .filter((e) => e.weight_kg !== null)
      .map((e) => ({
        date: e.measured_on,
        value: kgToDisplay(e.weight_kg as number, weightUnit),
      }));
    const smoothed = movingAverage(points, 7);
    return points.map((p, i) => ({
      date: p.date,
      label: format(new Date(`${p.date}T00:00:00`), "d MMM"),
      weight: Number(p.value.toFixed(1)),
      trend: Number(smoothed[i].value.toFixed(1)),
    }));
  }, [windowed, weightUnit]);

  const compositionSeries = useMemo(
    () =>
      windowed
        .filter((e) => e.body_fat_pct !== null || e.muscle_mass_kg !== null)
        .map((e) => ({
          label: format(new Date(`${e.measured_on}T00:00:00`), "d MMM"),
          fat: e.body_fat_pct,
          muscle:
            e.muscle_mass_kg === null
              ? null
              : Number(kgToDisplay(e.muscle_mass_kg, weightUnit).toFixed(1)),
        })),
    [windowed, weightUnit]
  );

  const tooltipStyle = {
    backgroundColor: c.surface,
    border: `1px solid ${c.grid}`,
    borderRadius: "8px",
    fontSize: "12px",
  };
  const axisTick = { fill: c.axis, fontSize: 11 };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 sm:w-fit">
        {RANGES.map((r) => (
          <button
            key={r.label}
            type="button"
            onClick={() => setRangeDays(r.days)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none",
              rangeDays === r.days
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      <ChartCard
        title="Weight"
        subtitle={`Daily reading against a 7-day average — the average is the one to read, the daily line is mostly water and salt.`}
      >
        {weightSeries.length === 0 ? (
          <EmptyChart message="No weigh-ins in this range yet." />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart
              data={weightSeries}
              margin={{ top: 5, right: 8, left: -16, bottom: 0 }}
            >
              <CartesianGrid stroke={c.grid} vertical={false} />
              <XAxis
                dataKey="label"
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                domain={["dataMin - 1", "dataMax + 1"]}
                unit={` ${weightUnit}`}
                width={64}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              {/* No target line here. Drawing one 6kg below the data forces
                  the axis to span the gap, which flattens the trend this chart
                  exists to show — and the card above already gives the target,
                  the distance to it and the date. */}
              <Line
                type="monotone"
                dataKey="weight"
                name="Daily"
                stroke={c.weight}
                strokeWidth={1}
                dot={false}
                opacity={0.45}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="trend"
                name="7-day average"
                stroke={c.trend}
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard
        title="Composition"
        subtitle="Body fat against muscle mass — the pair that says whether the weight change was the kind you wanted."
      >
        {compositionSeries.length === 0 ? (
          <EmptyChart message="No body-composition readings in this range yet." />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart
              data={compositionSeries}
              margin={{ top: 5, right: 8, left: -16, bottom: 0 }}
            >
              <CartesianGrid stroke={c.grid} vertical={false} />
              <XAxis
                dataKey="label"
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                yAxisId="fat"
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                domain={["dataMin - 2", "dataMax + 2"]}
                unit="%"
                width={56}
              />
              <YAxis
                yAxisId="muscle"
                orientation="right"
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                domain={["dataMin - 2", "dataMax + 2"]}
                unit={` ${weightUnit}`}
                width={64}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Line
                yAxisId="fat"
                type="monotone"
                dataKey="fat"
                name="Body fat"
                stroke={c.fat}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                yAxisId="muscle"
                type="monotone"
                dataKey="muscle"
                name="Muscle mass"
                stroke={c.muscle}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
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
