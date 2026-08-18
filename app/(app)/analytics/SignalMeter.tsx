import { TrendingDown, TrendingUp } from "lucide-react";
import {
  CATEGORY_ORDER,
  TASK_CATEGORIES,
  type TaskCategory,
} from "@/lib/constants";

type CategoryHours = Record<TaskCategory | "untagged", number>;

// Stack order is CATEGORY_ORDER — the action ladder, then personal — and the
// labels come from TASK_CATEGORIES rather than a second copy, which is how
// this legend used to drift from the picker. `untagged` is appended here
// because it is a "no data" bucket, not a category.
const SEGMENTS: Array<{ key: keyof CategoryHours; label: string; varName: string }> = [
  ...CATEGORY_ORDER.map((key) => ({
    key,
    label: TASK_CATEGORIES[key].label,
    varName: `--viz-${TASK_CATEGORIES[key].color}`,
  })),
  { key: "untagged" as const, label: "Untagged", varName: "--viz-untagged" },
];

type Props = {
  categories: CategoryHours;
  /** signal / (signal + noise), personal excluded; null when nothing tagged. */
  share: number | null;
  prevShare: number | null;
};

export function SignalMeter({ categories, share, prevShare }: Props) {
  const total = Object.values(categories).reduce((a, b) => a + b, 0);
  const deltaPts =
    share !== null && prevShare !== null
      ? Math.round((share - prevShare) * 100)
      : null;

  const rows = SEGMENTS.map((s) => ({
    ...s,
    hours: categories[s.key],
    pct: total > 0 ? (categories[s.key] / total) * 100 : 0,
  })).filter((r) => r.hours > 0);

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">Signal quality</h2>
        <span className="text-xs text-muted-foreground">
          signal ÷ (signal + noise)
        </span>
      </div>

      <div className="mt-2 flex items-baseline gap-3">
        <p className="text-5xl font-bold text-foreground">
          {share !== null ? `${Math.round(share * 100)}%` : "—"}
        </p>
        {deltaPts !== null && deltaPts !== 0 && (
          <span
            className={`inline-flex items-center gap-1 text-sm font-medium ${
              deltaPts > 0
                ? "text-[hsl(var(--strong-signal))]"
                : "text-[hsl(var(--strong-noise))]"
            }`}
          >
            {deltaPts > 0 ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )}
            {deltaPts > 0 ? "+" : ""}
            {deltaPts} pts vs previous period
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {share !== null
          ? "of your tagged work time went to signal tasks"
          : "tag time entries with sprint tasks to measure signal vs noise"}
      </p>

      {/* 100% stacked bar with 2px surface gaps between segments */}
      {total > 0 && (
        <>
          <div className="mt-5 flex h-4 w-full gap-0.5 overflow-hidden rounded-full">
            {rows.map((r) => (
              <div
                key={r.key}
                title={`${r.label}: ${r.hours.toFixed(1)}h (${Math.round(r.pct)}%)`}
                className="h-full rounded-[2px] first:rounded-l-full last:rounded-r-full"
                style={{
                  width: `${r.pct}%`,
                  minWidth: "3px",
                  backgroundColor: `var(${r.varName})`,
                }}
              />
            ))}
          </div>
          {/* Legend — identity never rides on color alone */}
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
            {rows.map((r) => (
              <li key={r.key} className="flex items-center gap-1.5 text-xs">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                  style={{ backgroundColor: `var(${r.varName})` }}
                />
                <span className="text-muted-foreground">{r.label}</span>
                <span className="ml-auto font-medium tabular-nums text-foreground">
                  {r.hours.toFixed(1)}h
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
