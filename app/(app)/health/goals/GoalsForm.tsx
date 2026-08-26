"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { GOAL_TYPES, type GoalType } from "@/lib/health/constants";
import {
  ageFrom,
  displayToKg,
  kgToDisplay,
  suggestDailyTargets,
  type VolumeUnit,
  type WeightUnit,
} from "@/lib/health/units";
import type { HealthProfile } from "@/lib/health/profile";
import { updateHealthGoals } from "./actions";

const CARD = "rounded-xl border border-border bg-card p-4 sm:p-6";
const INPUT =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60";
const LABEL = "mb-2 block text-sm font-medium text-foreground";
const HELP = "text-xs text-muted-foreground";

type Props = {
  profile: HealthProfile;
  latestWeightKg: number | null;
  todayIso: string;
};

/** Blank input → null (clear the goal); anything unparseable is ignored. */
function numberOrNull(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

export function GoalsForm({ profile, latestWeightKg, todayIso }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState({
    heightCm: profile.height_cm?.toString() ?? "",
    sex: profile.sex ?? "",
    birthDate: profile.birth_date ?? "",
    goalType: profile.goal_type,
    targetWeight:
      profile.target_weight_kg === null
        ? ""
        : kgToDisplay(profile.target_weight_kg, profile.weight_unit).toFixed(1),
    dailyWaterMlGoal: profile.daily_water_ml_goal.toString(),
    dailyKcalGoal: profile.daily_kcal_goal?.toString() ?? "",
    dailyProteinGGoal: profile.daily_protein_g_goal?.toString() ?? "",
    weeklyWorkoutGoal: profile.weekly_workout_goal.toString(),
    weightUnit: profile.weight_unit as WeightUnit,
    volumeUnit: profile.volume_unit as VolumeUnit,
  });

  const save = (payload: Parameters<typeof updateHealthGoals>[0]) => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateHealthGoals(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  const age = form.birthDate ? ageFrom(form.birthDate, todayIso) : null;
  const canSuggest =
    latestWeightKg !== null && form.heightCm !== "" && age !== null && form.sex !== "";

  const handleSuggest = () => {
    if (!canSuggest || latestWeightKg === null || age === null) return;
    const { kcal, proteinG } = suggestDailyTargets({
      weightKg: latestWeightKg,
      heightCm: Number(form.heightCm),
      ageYears: age,
      sex: form.sex as "male" | "female" | "other",
      goalType: form.goalType,
    });
    setForm((f) => ({
      ...f,
      dailyKcalGoal: kcal.toString(),
      dailyProteinGGoal: proteinG.toString(),
    }));
    save({ dailyKcalGoal: kcal, dailyProteinGGoal: proteinG });
  };

  return (
    <div className="space-y-6">
      {/* -------------------------------------------------- direction */}
      <div className={CARD}>
        <h2 className="text-sm font-semibold text-foreground">
          What are you aiming for?
        </h2>
        <p className={cn(HELP, "mt-1")}>
          This is how your assistant reads a trend — losing 400g a week is
          progress on a cut and a problem on a bulk.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {GOAL_TYPES.map((goal) => {
            const isActive = form.goalType === goal.value;
            return (
              <button
                key={goal.value}
                type="button"
                disabled={pending}
                onClick={() => {
                  setForm((f) => ({ ...f, goalType: goal.value as GoalType }));
                  save({ goalType: goal.value });
                }}
                className={cn(
                  "rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-60",
                  isActive
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                )}
              >
                <span className="block text-sm font-medium">{goal.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {goal.hint}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 max-w-xs">
          <label htmlFor="target_weight" className={LABEL}>
            Target weight ({form.weightUnit})
          </label>
          <input
            id="target_weight"
            type="number"
            inputMode="decimal"
            step="0.1"
            value={form.targetWeight}
            disabled={pending}
            onChange={(e) => setForm((f) => ({ ...f, targetWeight: e.target.value }))}
            onBlur={(e) => {
              const value = numberOrNull(e.target.value);
              if (value === undefined) return;
              save({
                targetWeightKg:
                  value === null ? null : displayToKg(value, form.weightUnit),
              });
            }}
            className={INPUT}
            placeholder="Optional"
          />
          <p className={cn(HELP, "mt-1")}>
            Leave blank if you are not chasing a number.
          </p>
        </div>
      </div>

      {/* -------------------------------------------------- daily targets */}
      <div className={CARD}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Daily targets
            </h2>
            <p className={cn(HELP, "mt-1")}>
              What the rings on the overview fill up against.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSuggest}
            disabled={pending || !canSuggest}
            title={
              canSuggest
                ? undefined
                : "Needs your height, date of birth, sex and at least one logged weight"
            }
            className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Suggest from my stats
          </button>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="water_goal" className={LABEL}>
              Water (ml)
            </label>
            <input
              id="water_goal"
              type="number"
              inputMode="numeric"
              step="100"
              value={form.dailyWaterMlGoal}
              disabled={pending}
              onChange={(e) =>
                setForm((f) => ({ ...f, dailyWaterMlGoal: e.target.value }))
              }
              onBlur={(e) => {
                const value = numberOrNull(e.target.value);
                if (value === undefined || value === null) return;
                save({ dailyWaterMlGoal: Math.round(value) });
              }}
              className={INPUT}
            />
          </div>

          <div>
            <label htmlFor="kcal_goal" className={LABEL}>
              Calories (kcal)
            </label>
            <input
              id="kcal_goal"
              type="number"
              inputMode="numeric"
              step="10"
              value={form.dailyKcalGoal}
              disabled={pending}
              onChange={(e) =>
                setForm((f) => ({ ...f, dailyKcalGoal: e.target.value }))
              }
              onBlur={(e) => {
                const value = numberOrNull(e.target.value);
                if (value === undefined) return;
                save({ dailyKcalGoal: value === null ? null : Math.round(value) });
              }}
              className={INPUT}
              placeholder="Optional"
            />
          </div>

          <div>
            <label htmlFor="protein_goal" className={LABEL}>
              Protein (g)
            </label>
            <input
              id="protein_goal"
              type="number"
              inputMode="numeric"
              step="5"
              value={form.dailyProteinGGoal}
              disabled={pending}
              onChange={(e) =>
                setForm((f) => ({ ...f, dailyProteinGGoal: e.target.value }))
              }
              onBlur={(e) => {
                const value = numberOrNull(e.target.value);
                if (value === undefined) return;
                save({
                  dailyProteinGGoal: value === null ? null : Math.round(value),
                });
              }}
              className={INPUT}
              placeholder="Optional"
            />
          </div>

          <div>
            <label htmlFor="workout_goal" className={LABEL}>
              Workouts / week
            </label>
            <input
              id="workout_goal"
              type="number"
              inputMode="numeric"
              min={0}
              max={14}
              value={form.weeklyWorkoutGoal}
              disabled={pending}
              onChange={(e) =>
                setForm((f) => ({ ...f, weeklyWorkoutGoal: e.target.value }))
              }
              onBlur={(e) => {
                const value = numberOrNull(e.target.value);
                if (value === undefined || value === null) return;
                save({ weeklyWorkoutGoal: Math.round(value) });
              }}
              className={INPUT}
            />
          </div>
        </div>
      </div>

      {/* -------------------------------------------------- about you */}
      <div className={CARD}>
        <h2 className="text-sm font-semibold text-foreground">About you</h2>
        <p className={cn(HELP, "mt-1")}>
          Only used to work out BMI and to suggest targets. Nothing here is
          shared with a reviewer — the whole Health tab is private to you.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="height" className={LABEL}>
              Height (cm)
            </label>
            <input
              id="height"
              type="number"
              inputMode="decimal"
              step="0.5"
              value={form.heightCm}
              disabled={pending}
              onChange={(e) => setForm((f) => ({ ...f, heightCm: e.target.value }))}
              onBlur={(e) => {
                const value = numberOrNull(e.target.value);
                if (value === undefined) return;
                save({ heightCm: value });
              }}
              className={INPUT}
              placeholder="Optional"
            />
          </div>

          <div>
            <label htmlFor="birth_date" className={LABEL}>
              Date of birth
            </label>
            <input
              id="birth_date"
              type="date"
              max={todayIso}
              value={form.birthDate}
              disabled={pending}
              onChange={(e) => {
                setForm((f) => ({ ...f, birthDate: e.target.value }));
                save({ birthDate: e.target.value === "" ? null : e.target.value });
              }}
              className={INPUT}
            />
          </div>

          <div>
            <label htmlFor="sex" className={LABEL}>
              Sex
            </label>
            <select
              id="sex"
              value={form.sex}
              disabled={pending}
              onChange={(e) => {
                setForm((f) => ({ ...f, sex: e.target.value }));
                save({
                  sex:
                    e.target.value === ""
                      ? null
                      : (e.target.value as "male" | "female" | "other"),
                });
              }}
              className={INPUT}
            >
              <option value="">Prefer not to say</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
            <p className={cn(HELP, "mt-1")}>
              Changes the BMR constant used for suggestions.
            </p>
          </div>

          <div>
            <label htmlFor="weight_unit" className={LABEL}>
              Show weights in
            </label>
            <select
              id="weight_unit"
              value={form.weightUnit}
              disabled={pending}
              onChange={(e) => {
                const unit = e.target.value as WeightUnit;
                setForm((f) => ({
                  ...f,
                  weightUnit: unit,
                  targetWeight:
                    profile.target_weight_kg === null
                      ? f.targetWeight
                      : kgToDisplay(profile.target_weight_kg, unit).toFixed(1),
                }));
                save({ weightUnit: unit });
              }}
              className={INPUT}
            >
              <option value="kg">Kilograms</option>
              <option value="lb">Pounds</option>
            </select>
            <p className={cn(HELP, "mt-1")}>
              Display only — everything is stored in kg.
            </p>
          </div>
        </div>
      </div>

      <div className="flex min-h-[20px] items-center gap-2 text-xs">
        {error && <span className="text-destructive">{error}</span>}
        {!error && saved && !pending && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Check className="h-3.5 w-3.5" />
            Saved
          </span>
        )}
        {pending && <span className="text-muted-foreground">Saving…</span>}
      </div>
    </div>
  );
}
