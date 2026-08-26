"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addDays, format } from "date-fns";
import { ChevronDown, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { displayToKg, kgToDisplay, type WeightUnit } from "@/lib/health/units";
import { deleteBodyMetrics, saveBodyMetrics } from "./actions";

export type BodyRow = {
  measured_on: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  muscle_mass_kg: number | null;
  water_pct: number | null;
  bone_mass_kg: number | null;
  visceral_fat: number | null;
  bmi: number | null;
  bmr: number | null;
  protein_pct: number | null;
  subcutaneous_fat_pct: number | null;
  skeletal_muscle_pct: number | null;
  metabolic_age: number | null;
  waist_cm: number | null;
  chest_cm: number | null;
  arm_cm: number | null;
  thigh_cm: number | null;
  hip_cm: number | null;
  neck_cm: number | null;
  notes: string | null;
};

type Props = {
  date: string;
  todayIso: string;
  entry: BodyRow | null;
  weightUnit: WeightUnit;
};

// Everything past the weight lives behind a disclosure. A scale that reports
// thirteen numbers should not make the person who only steps on it see
// thirteen empty boxes every morning.
const EXTRA_FIELDS = [
  { key: "bodyFatPct", column: "body_fat_pct", label: "Body fat", unit: "%", step: "0.1" },
  { key: "muscleMassKg", column: "muscle_mass_kg", label: "Muscle mass", unit: "kg", step: "0.1" },
  { key: "skeletalMusclePct", column: "skeletal_muscle_pct", label: "Skeletal muscle", unit: "%", step: "0.1" },
  { key: "waterPct", column: "water_pct", label: "Body water", unit: "%", step: "0.1" },
  { key: "boneMassKg", column: "bone_mass_kg", label: "Bone mass", unit: "kg", step: "0.1" },
  { key: "proteinPct", column: "protein_pct", label: "Protein", unit: "%", step: "0.1" },
  { key: "subcutaneousFatPct", column: "subcutaneous_fat_pct", label: "Subcutaneous fat", unit: "%", step: "0.1" },
  { key: "visceralFat", column: "visceral_fat", label: "Visceral fat", unit: "", step: "0.1" },
  { key: "bmi", column: "bmi", label: "BMI", unit: "", step: "0.1" },
  { key: "bmr", column: "bmr", label: "BMR", unit: "kcal", step: "1" },
  { key: "metabolicAge", column: "metabolic_age", label: "Metabolic age", unit: "yrs", step: "1" },
] as const;

const TAPE_FIELDS = [
  { key: "waistCm", column: "waist_cm", label: "Waist" },
  { key: "chestCm", column: "chest_cm", label: "Chest" },
  { key: "armCm", column: "arm_cm", label: "Arm" },
  { key: "thighCm", column: "thigh_cm", label: "Thigh" },
  { key: "hipCm", column: "hip_cm", label: "Hip" },
  { key: "neckCm", column: "neck_cm", label: "Neck" },
] as const;

const INPUT =
  "h-11 w-full rounded-md border border-border bg-background px-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60";
const LABEL = "mb-1.5 block text-sm font-medium text-foreground";

function shiftDate(date: string, days: number): string {
  return format(addDays(new Date(`${date}T00:00:00`), days), "yyyy-MM-dd");
}

function toField(value: number | null): string {
  return value === null ? "" : String(value);
}

/** "" clears the reading; a non-number leaves it untouched. */
function parseField(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

export function BodyLogger({ date, todayIso, entry, weightUnit }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [xpGained, setXpGained] = useState(0);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);

  const [weight, setWeight] = useState(
    entry?.weight_kg == null
      ? ""
      : kgToDisplay(entry.weight_kg, weightUnit).toFixed(1)
  );
  const [extras, setExtras] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of [...EXTRA_FIELDS, ...TAPE_FIELDS]) {
      init[f.key] = toField(
        (entry?.[f.column as keyof BodyRow] as number | null) ?? null
      );
    }
    return init;
  });
  const [notes, setNotes] = useState(entry?.notes ?? "");

  const go = (next: string) => {
    router.push(next === todayIso ? "/health/body" : `/health/body?date=${next}`);
  };

  const handleSave = () => {
    setError(null);
    setSavedAt(null);
    setXpGained(0);

    const payload: Record<string, unknown> = { measuredOn: date };

    const parsedWeight = parseField(weight);
    if (parsedWeight === undefined) {
      setError("Weight must be a number.");
      return;
    }
    payload.weightKg =
      parsedWeight === null ? null : displayToKg(parsedWeight, weightUnit);

    for (const f of [...EXTRA_FIELDS, ...TAPE_FIELDS]) {
      const parsed = parseField(extras[f.key] ?? "");
      if (parsed === undefined) {
        setError(`${f.label} must be a number.`);
        return;
      }
      payload[f.key] = parsed;
    }
    payload.notes = notes.trim() === "" ? null : notes.trim();

    startTransition(async () => {
      const result = await saveBodyMetrics(
        payload as Parameters<typeof saveBodyMetrics>[0]
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSavedAt(new Date().toLocaleTimeString());
      setXpGained("xp" in result && result.xp ? result.xp : 0);
      router.refresh();
    });
  };

  const handleDelete = () => {
    if (!confirm(`Delete the measurements for ${date}?`)) return;
    startTransition(async () => {
      const result = await deleteBodyMetrics(date);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setWeight("");
      setExtras({});
      setNotes("");
      setSavedAt(null);
      router.refresh();
    });
  };

  const isToday = date === todayIso;
  const filledExtras = [...EXTRA_FIELDS, ...TAPE_FIELDS].filter(
    (f) => (extras[f.key] ?? "") !== ""
  ).length;

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
      {/* ------------------------------------------------------ date nav */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => go(shiftDate(date, -1))}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Prev</span>
          </button>
          <input
            type="date"
            value={date}
            max={todayIso}
            onChange={(e) => e.target.value && go(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="button"
            onClick={() => go(shiftDate(date, 1))}
            disabled={isToday}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-40"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          {!isToday && (
            <button
              type="button"
              onClick={() => go(todayIso)}
              className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              Today
            </button>
          )}
        </div>
        <span className="text-sm font-medium text-muted-foreground">
          {format(new Date(`${date}T00:00:00`), "EEE, MMM d, yyyy")}
        </span>
      </div>

      {/* -------------------------------------------------------- weight */}
      <div className="mt-5 max-w-xs">
        <label htmlFor="weight" className={LABEL}>
          Weight ({weightUnit})
        </label>
        <input
          id="weight"
          type="number"
          inputMode="decimal"
          step="0.1"
          autoFocus={!entry}
          value={weight}
          disabled={pending}
          onChange={(e) => setWeight(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
          }}
          className={INPUT}
          placeholder="—"
        />
      </div>

      {/* --------------------------------------------------- disclosure */}
      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        className="mt-4 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform", showMore && "rotate-180")}
        />
        More measurements
        {!showMore && filledExtras > 0 && (
          <span className="text-primary">({filledExtras} filled)</span>
        )}
      </button>

      {showMore && (
        <div className="mt-3 space-y-5 border-t border-border pt-5">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Scale
            </h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {EXTRA_FIELDS.map((f) => (
                <div key={f.key}>
                  <label htmlFor={f.key} className={LABEL}>
                    {f.label}
                    {f.unit && (
                      <span className="ml-1 font-normal text-muted-foreground">
                        ({f.unit})
                      </span>
                    )}
                  </label>
                  <input
                    id={f.key}
                    type="number"
                    inputMode="decimal"
                    step={f.step}
                    value={extras[f.key] ?? ""}
                    disabled={pending}
                    onChange={(e) =>
                      setExtras((s) => ({ ...s, [f.key]: e.target.value }))
                    }
                    className={INPUT}
                    placeholder="—"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Tape (cm)
            </h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {TAPE_FIELDS.map((f) => (
                <div key={f.key}>
                  <label htmlFor={f.key} className={LABEL}>
                    {f.label}
                  </label>
                  <input
                    id={f.key}
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={extras[f.key] ?? ""}
                    disabled={pending}
                    onChange={(e) =>
                      setExtras((s) => ({ ...s, [f.key]: e.target.value }))
                    }
                    className={INPUT}
                    placeholder="—"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="body_notes" className={LABEL}>
              Notes
            </label>
            <textarea
              id="body_notes"
              rows={2}
              value={notes}
              disabled={pending}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              placeholder="Slept badly, ate late — anything that explains the number."
            />
          </div>
        </div>
      )}

      {/* ----------------------------------------------------- save row */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "Saving…" : entry ? "Update" : "Save"}
        </button>

        {entry && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          >
            <Trash2 className="mr-1 inline h-3.5 w-3.5" />
            Delete
          </button>
        )}

        {xpGained > 0 && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            +{xpGained} XP
          </span>
        )}
        {savedAt && !pending && (
          <span className="text-xs text-muted-foreground">Saved at {savedAt}</span>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
