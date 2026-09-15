"use client";

import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const FIELD_LABEL = "mb-1.5 block text-sm font-medium text-foreground";
export const FIELD_HINT = "mt-1 text-xs text-muted-foreground";
export const INPUT =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary sm:text-sm";

export function PillGroup<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T | null;
  options: readonly { value: T; label: string; dot?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend className={FIELD_LABEL}>{label}</legend>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
              value === o.value
                ? "border-primary bg-primary/10 font-medium text-foreground"
                : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {o.dot && <span className={cn("h-2 w-2 rounded-full", o.dot)} aria-hidden />}
            {o.label}
          </button>
        ))}
      </div>
      {hint && <p className={FIELD_HINT}>{hint}</p>}
    </fieldset>
  );
}

export function StepsEditor({
  steps,
  onChange,
}: {
  steps: string[];
  onChange: (steps: string[]) => void;
}) {
  const update = (index: number, text: string) =>
    onChange(steps.map((s, i) => (i === index ? text : s)));

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">Steps</p>
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {i + 1}.
          </span>
          <label htmlFor={`goal_step_${i}`} className="sr-only">
            Step {i + 1}
          </label>
          <input
            id={`goal_step_${i}`}
            value={step}
            maxLength={200}
            onChange={(e) => update(i, e.target.value)}
            placeholder={i === 0 ? "The first milestone" : "Next milestone"}
            className={INPUT}
          />
          {steps.length > 1 && (
            <button
              type="button"
              onClick={() => onChange(steps.filter((_, j) => j !== i))}
              aria-label={`Remove step ${i + 1}`}
              className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
      {steps.length < 30 && (
        <button
          type="button"
          onClick={() => onChange([...steps, ""])}
          className="ml-7 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <Plus className="h-3.5 w-3.5" />
          Add a step
        </button>
      )}
      <p className={FIELD_HINT}>You can add, tick off and remove steps later on the goal page.</p>
    </div>
  );
}

export function NumberFields({
  startValue,
  targetValue,
  unit,
  onChange,
}: {
  startValue: string;
  targetValue: string;
  unit: string;
  onChange: (patch: Partial<{ startValue: string; targetValue: string; unit: string }>) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_7rem]">
      <div>
        <label htmlFor="goal_start_value" className={FIELD_LABEL}>
          Where you are now
        </label>
        <input
          id="goal_start_value"
          type="number"
          inputMode="decimal"
          step="any"
          value={startValue}
          onChange={(e) => onChange({ startValue: e.target.value })}
          placeholder="8"
          className={INPUT}
        />
      </div>
      <div>
        <label htmlFor="goal_target_value" className={FIELD_LABEL}>
          Where you want to be
        </label>
        <input
          id="goal_target_value"
          type="number"
          inputMode="decimal"
          step="any"
          value={targetValue}
          onChange={(e) => onChange({ targetValue: e.target.value })}
          placeholder="21"
          className={INPUT}
        />
      </div>
      <div>
        <label htmlFor="goal_unit" className={FIELD_LABEL}>
          Unit
        </label>
        <input
          id="goal_unit"
          value={unit}
          maxLength={20}
          onChange={(e) => onChange({ unit: e.target.value })}
          placeholder="km"
          className={INPUT}
        />
      </div>
    </div>
  );
}
