import { addDays, format } from "date-fns";
import { TrendingDown, TrendingUp, Minus, Target } from "lucide-react";
import {
  daysToTarget,
  formatWeight,
  kgToDisplay,
  ratePerWeek,
  type DatedValue,
  type WeightUnit,
} from "@/lib/health/units";
import type { GoalType } from "@/lib/health/constants";

type Props = {
  /** Oldest first. */
  points: DatedValue[];
  weightUnit: WeightUnit;
  targetWeightKg: number | null;
  goalType: GoalType;
  todayIso: string;
};

const CARD = "rounded-xl border border-border bg-card p-4";

function windowed(points: DatedValue[], days: number, todayIso: string) {
  const cutoff = Date.parse(`${todayIso}T00:00:00`) - days * 86_400_000;
  return points.filter((p) => Date.parse(`${p.date}T00:00:00`) >= cutoff);
}

/**
 * Whether a rate is going the way the user asked for. A cut wants the number
 * falling; a bulk wants it rising; maintain and recomp want it still, so
 * anything inside ±150 g/week counts as holding.
 */
function verdict(
  ratePerWeekKg: number | null,
  goalType: GoalType
): "good" | "warn" | "neutral" {
  if (ratePerWeekKg === null) return "neutral";
  const flat = Math.abs(ratePerWeekKg) < 0.15;

  if (goalType === "cut") return ratePerWeekKg < -0.1 ? "good" : "warn";
  if (goalType === "bulk") return ratePerWeekKg > 0.1 ? "good" : "warn";
  return flat ? "good" : "warn";
}

const TONE_CLASSES = {
  good: "text-[hsl(var(--progress-good))]",
  warn: "text-[hsl(var(--progress-warning))]",
  neutral: "text-muted-foreground",
} as const;

export function BodyTrend({
  points,
  weightUnit,
  targetWeightKg,
  goalType,
  todayIso,
}: Props) {
  if (points.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
        <p className="text-sm text-muted-foreground">
          Log a weight and the trend appears here — rate of change, and how long
          the current pace takes to reach your target.
        </p>
      </div>
    );
  }

  const currentKg = points[points.length - 1].value;
  const rates = [7, 30, 90].map((days) => ({
    days,
    rate: ratePerWeek(windowed(points, days, todayIso)),
  }));

  // 30 days is the honest headline: a week of readings is noise, 90 days is
  // too slow to react to.
  const headline = rates.find((r) => r.days === 30)?.rate ?? null;
  const tone = verdict(headline, goalType);

  const eta =
    targetWeightKg === null
      ? null
      : daysToTarget(currentKg, targetWeightKg, headline);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className={CARD}>
        <p className="text-xs font-medium text-muted-foreground">Current</p>
        <p className="mt-1 text-2xl font-bold text-foreground">
          {formatWeight(currentKg, weightUnit)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {format(
            new Date(`${points[points.length - 1].date}T00:00:00`),
            "d MMM"
          )}
        </p>
      </div>

      {rates.map(({ days, rate }) => {
        const display =
          rate === null ? null : kgToDisplay(rate, weightUnit);
        // No arrow when there is no rate — an icon next to an em dash reads as
        // a value rather than as the absence of one.
        const Icon =
          rate === null
            ? null
            : Math.abs(rate) < 0.05
              ? Minus
              : rate > 0
                ? TrendingUp
                : TrendingDown;

        return (
          <div key={days} className={CARD}>
            <p className="text-xs font-medium text-muted-foreground">
              {days}-day rate
            </p>
            <p
              className={`mt-1 flex items-center gap-1.5 text-2xl font-bold ${
                days === 30 ? TONE_CLASSES[tone] : "text-foreground"
              }`}
            >
              {Icon && <Icon className="h-5 w-5 shrink-0" />}
              {display === null
                ? "—"
                : `${display > 0 ? "+" : ""}${display.toFixed(2)}`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {display === null
                ? "Needs 3+ readings"
                : `${weightUnit}/week`}
            </p>
          </div>
        );
      })}

      {targetWeightKg !== null && (
        <div className={`${CARD} sm:col-span-2 lg:col-span-4`}>
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Target className="h-3.5 w-3.5" />
            Target {formatWeight(targetWeightKg, weightUnit)}
          </p>
          <p className="mt-1 text-sm text-foreground">
            {eta === null ? (
              headline === null ? (
                "Not enough readings yet to project a date."
              ) : (
                <>
                  At the current pace you are not moving towards it —{" "}
                  {Math.abs(kgToDisplay(currentKg - targetWeightKg, weightUnit)).toFixed(
                    1
                  )}{" "}
                  {weightUnit} away.
                </>
              )
            ) : (
              <>
                About{" "}
                <span className="font-semibold">
                  {eta} day{eta === 1 ? "" : "s"}
                </span>{" "}
                away at the current pace — around{" "}
                {format(
                  addDays(new Date(`${todayIso}T00:00:00`), eta),
                  "d MMM yyyy"
                )}
                .
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
