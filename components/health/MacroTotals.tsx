import { cn } from "@/lib/utils";
import type { MacroLike } from "@/lib/health/units";

type Props = {
  totals: MacroLike;
  kcalGoal: number | null;
  proteinGoal: number | null;
  compact?: boolean;
};

/**
 * The day's intake against its targets.
 *
 * Only calories and protein get a bar, because only they have a target worth
 * hitting. Carbs and fat are reported as numbers — they are the consequence of
 * the other two, not a thing to aim at.
 */
export function MacroTotals({
  totals,
  kcalGoal,
  proteinGoal,
  compact = false,
}: Props) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card",
        compact ? "p-4" : "p-4 sm:p-6"
      )}
    >
      <h2 className="text-sm font-semibold text-foreground">Today&apos;s food</h2>

      <div className="mt-3 space-y-3">
        <Meter
          label="Calories"
          value={totals.kcal}
          goal={kcalGoal}
          unit="kcal"
        />
        <Meter
          label="Protein"
          value={totals.protein_g}
          goal={proteinGoal}
          unit="g"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
        <span>Carbs {Math.round(totals.carbs_g)}g</span>
        <span>Fat {Math.round(totals.fat_g)}g</span>
        <span>Fibre {Math.round(totals.fiber_g)}g</span>
      </div>
    </div>
  );
}

function Meter({
  label,
  value,
  goal,
  unit,
}: {
  label: string;
  value: number;
  goal: number | null;
  unit: string;
}) {
  const rounded = Math.round(value);

  if (!goal) {
    return (
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-foreground">{label}</span>
        <span className="text-sm tabular-nums text-muted-foreground">
          {rounded} {unit}
          <span className="ml-2 text-xs">no target set</span>
        </span>
      </div>
    );
  }

  const pct = Math.min(100, Math.round((value / goal) * 100));
  // Calories can be overshot, protein essentially cannot, so "over" is only
  // worth colouring as a warning where it means something.
  const met = value >= goal;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-foreground">{label}</span>
        <span className="text-sm tabular-nums text-muted-foreground">
          {rounded} / {goal} {unit}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            met ? "bg-[hsl(var(--progress-good))]" : "bg-primary"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
