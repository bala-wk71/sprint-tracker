"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Droplet, Scale } from "lucide-react";
import { WATER_PRESETS } from "@/lib/health/constants";
import { displayToKg, formatVolume, formatWeight, kgToDisplay, type VolumeUnit, type WeightUnit } from "@/lib/health/units";
import { announceXp } from "@/lib/xpToast";
import { logWater } from "@/app/(app)/health/actions";
import { saveBodyMetrics } from "@/app/(app)/health/body/actions";

const BTN =
  "rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:border-primary/50 disabled:opacity-50";

export function WaterWeight({
  date,
  waterMl,
  waterGoalMl,
  volumeUnit,
  weightKg,
  weightUnit,
}: {
  date: string;
  waterMl: number;
  waterGoalMl: number;
  volumeUnit: VolumeUnit;
  weightKg: number | null;
  weightUnit: WeightUnit;
}) {
  const router = useRouter();
  const [weight, setWeight] = useState(weightKg !== null ? kgToDisplay(weightKg, weightUnit).toFixed(1) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const addWater = (amountMl: number) =>
    startTransition(async () => {
      setError(null);
      const result = await logWater({ logDate: date, amountMl });
      if (!result.ok) return setError(result.error);
      announceXp(result.xp, "Water goal");
      router.refresh();
    });

  const value = Number(weight);
  const weightChanged = weight.trim() !== "" && Number.isFinite(value) && value > 0 &&
    (weightKg === null || Math.abs(kgToDisplay(weightKg, weightUnit) - value) >= 0.05);

  const saveWeight = () =>
    startTransition(async () => {
      setError(null);
      const result = await saveBodyMetrics({ measuredOn: date, weightKg: Math.round(displayToKg(value, weightUnit) * 100) / 100 });
      if (!result.ok) return setError(result.error);
      announceXp(result.xp, "Weigh-in");
      router.refresh();
    });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Droplet className="h-4 w-4 text-muted-foreground" />
          Water · {formatVolume(waterMl, volumeUnit)}
          <span className="font-normal text-muted-foreground">of {formatVolume(waterGoalMl, volumeUnit)}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {WATER_PRESETS.map((ml) => (
            <button key={ml} type="button" onClick={() => addWater(ml)} disabled={pending} className={BTN}>
              +{formatVolume(ml, volumeUnit)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="wrapup_weight" className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Scale className="h-4 w-4 text-muted-foreground" />
          Weighed today?
          {weightKg !== null && <span className="font-normal text-muted-foreground">{formatWeight(weightKg, weightUnit)}</span>}
        </label>
        <div className="flex gap-2">
          <input
            id="wrapup_weight"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder={weightUnit}
            className="h-9 w-24 rounded-md border border-border bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button type="button" onClick={saveWeight} disabled={pending || !weightChanged} className={BTN}>
            Save
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
    </div>
  );
}
