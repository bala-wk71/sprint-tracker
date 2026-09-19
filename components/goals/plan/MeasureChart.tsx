"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { format } from "date-fns";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { pathSeries, type Path, type Point } from "@/lib/planning/projection";
import { formatBand, formatMeasure } from "@/lib/planning/format";
import { addDaysIso } from "@/lib/week";

// Recharts writes SVG attributes, which can't read CSS variables, so the hex
// lives here per theme. Same steps as the Health charts (--viz-* in globals.css):
// the plan is a quiet band, the actual line is the one thing in full colour.
const PALETTES = {
  light: { actual: "#2a78d6", band: "#2a78d6", grid: "#e8e4da", axis: "#7d7466", surface: "#ffffff", today: "#b6ad9e" },
  dark: { actual: "#3987e5", band: "#3987e5", grid: "#262f3d", axis: "#8b95a5", surface: "#161b22", today: "#4a5566" },
} as const;

const emptySubscribe = () => () => {};
const ts = (iso: string) => Date.parse(`${iso}T00:00:00`);

type Row = { t: number; band?: [number, number]; plan?: string; actual?: number };

export function MeasureChart({
  path,
  points,
  unit,
  todayIso,
  label,
}: {
  path: Path;
  points: Point[];
  unit: string | null;
  todayIso: string;
  label: string;
}) {
  const { resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const c = PALETTES[mounted && resolvedTheme === "dark" ? "dark" : "light"];
  const [whole, setWhole] = useState(false);

  const checkpointDates = path.checkpoints.map((p) => p.date).sort();
  const start = path.baseline?.date ?? points[0]?.date ?? checkpointDates[0] ?? todayIso;
  const lastCheckpoint = checkpointDates.at(-1) ?? todayIso;
  const nextCheckpoint = checkpointDates.find((d) => d > todayIso);
  // "Now" frames the stretch that matters this season: start to the next
  // checkpoint. "Whole plan" shows every year, however far out.
  const nearEnd = [nextCheckpoint ?? lastCheckpoint, addDaysIso(todayIso, 30)].sort().at(-1)!;
  const end = whole ? [lastCheckpoint, todayIso].sort().at(-1)! : nearEnd;
  const canToggle = lastCheckpoint > nearEnd;

  const data = useMemo(() => {
    const rows = new Map<number, Row>();
    for (const p of pathSeries(path, start, end, 40)) {
      const lo = p.min ?? p.max;
      const hi = p.max ?? p.min;
      if (lo === null || hi === null) continue;
      rows.set(ts(p.date), { t: ts(p.date), band: [lo, hi], plan: formatBand(p.min, p.max, unit) });
    }
    for (const p of points) {
      if (p.date < start || p.date > end) continue;
      const row = rows.get(ts(p.date)) ?? { t: ts(p.date) };
      row.actual = Number(p.value.toFixed(2));
      rows.set(ts(p.date), row);
    }
    return [...rows.values()].sort((a, b) => a.t - b.t);
  }, [path, points, start, end, unit]);

  if (data.length < 2) return null;

  const tick = { fill: c.axis, fontSize: 11 };
  const spanDays = (ts(end) - ts(start)) / 86_400_000;
  const tickFormat = (t: number) => format(new Date(t), spanDays > 400 ? "MMM yy" : "d MMM");

  return (
    <figure className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <figcaption className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm" style={{ backgroundColor: c.band, opacity: 0.22 }} aria-hidden />
            Plan
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: c.actual }} aria-hidden />
            Actual
          </span>
          <span className="sr-only">for {label}</span>
        </figcaption>
        {canToggle && (
          <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Chart range">
            {[
              { value: false, text: "Now" },
              { value: true, text: "Whole plan" },
            ].map((o) => (
              <button
                key={o.text}
                type="button"
                aria-pressed={whole === o.value}
                onClick={() => setWhole(o.value)}
                className={cn(
                  "rounded px-2 py-0.5 font-medium",
                  whole === o.value ? "bg-primary text-primary-foreground" : "hover:text-foreground"
                )}
              >
                {o.text}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="h-48 sm:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[ts(start), ts(end)]}
              tickFormatter={tickFormat}
              tick={tick}
              stroke={c.grid}
              minTickGap={28}
            />
            <YAxis
              tick={tick}
              stroke={c.grid}
              width={unit === "inr" ? 64 : 40}
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => (unit === "inr" ? formatMeasure(v, "inr") : unit === "level" ? `L${v}` : String(v))}
              allowDecimals={unit !== "level"}
            />
            <Tooltip
              contentStyle={{ backgroundColor: c.surface, border: `1px solid ${c.grid}`, borderRadius: 8, fontSize: 12 }}
              labelFormatter={(t) => format(new Date(Number(t)), "d MMM yyyy")}
              formatter={(value, name) =>
                name === "band"
                  ? [Array.isArray(value) ? formatBand(Number(value[0]), Number(value[1]), unit) : "", "Plan"]
                  : [formatMeasure(Number(value), unit), "Actual"]
              }
            />
            {todayIso >= start && todayIso <= end && (
              <ReferenceLine x={ts(todayIso)} stroke={c.today} strokeDasharray="3 3" />
            )}
            <Area
              dataKey="band"
              name="band"
              type="linear"
              stroke={c.band}
              strokeOpacity={0.35}
              strokeWidth={1}
              fill={c.band}
              fillOpacity={0.16}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              dataKey="actual"
              name="actual"
              type="linear"
              stroke={c.actual}
              strokeWidth={2}
              dot={points.length <= 40 ? { r: 4, strokeWidth: 2, stroke: c.surface, fill: c.actual } : false}
              activeDot={{ r: 5, stroke: c.surface, strokeWidth: 2 }}
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
