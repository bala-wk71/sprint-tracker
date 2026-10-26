"use client";

import { format } from "date-fns";
import { CheckSquare, Repeat, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { GOAL_TYPES, type GoalType } from "@/lib/goals/constants";
import { LEVER_SOURCES, MEASURE_SOURCES, isBodySource, type LeverSource, type MeasureSource } from "@/lib/planning/constants";
import { loanBalance } from "@/lib/planning/projection";
import { formatMeasure } from "@/lib/planning/format";
import { FIELD_HINT, FIELD_LABEL, INPUT } from "./GoalFormParts";

const ICONS = { number: TrendingDown, habit: Repeat, steps: CheckSquare } as const;

/** The first question: which of the three kinds of goal this is. */
export function GoalTypePicker({ value, onChange }: { value: GoalType | null; onChange: (value: GoalType) => void }) {
  return (
    <div role="radiogroup" aria-labelledby="goal_type_q" className="space-y-2">
      <p id="goal_type_q" className={FIELD_LABEL}>
        What kind of goal is it?
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        {GOAL_TYPES.map((t) => {
          const Icon = ICONS[t.value];
          const on = value === t.value;
          return (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(t.value)}
              className={cn(
                "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
                on ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 hover:bg-accent/50"
              )}
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Icon className={cn("h-4 w-4", on ? "text-primary" : "text-muted-foreground")} />
                {t.label}
              </span>
              <span className="text-xs text-muted-foreground">{t.example}</span>
            </button>
          );
        })}
      </div>
      {value && <p className={FIELD_HINT}>{GOAL_TYPES.find((t) => t.value === value)?.hint}</p>}
    </div>
  );
}

export type TargetDraft = {
  source: MeasureSource;
  label: string;
  unit: string;
  start: string;
  target: string;
  emi: string;
  lastEmiOn: string;
};

export const EMPTY_TARGET: TargetDraft = {
  source: "body.weight_kg",
  label: "",
  unit: "inr",
  start: "",
  target: "",
  emi: "",
  lastEmiOn: "",
};

/** Units a typed-in number can have. Health and loans bring their own. */
const MANUAL_UNITS = [
  { value: "inr", label: "₹" },
  { value: "kg", label: "kg" },
  { value: "km", label: "km" },
  { value: "%", label: "%" },
  { value: "", label: "A count" },
] as const;

export type LatestReading = { value: number; on: string };

export function TargetFields({
  draft,
  onChange,
  latest,
  todayIso,
}: {
  draft: TargetDraft;
  onChange: (patch: Partial<TargetDraft>) => void;
  /** The newest Health reading per body source, to start from. */
  latest: Partial<Record<MeasureSource, LatestReading>>;
  todayIso: string;
}) {
  const source = MEASURE_SOURCES.find((s) => s.value === draft.source) ?? MEASURE_SOURCES[0];
  const loan = draft.source === "loan_schedule";
  const manual = draft.source === "manual";
  const unit = manual ? draft.unit : source.unit;
  const reading = latest[draft.source];
  const emi = Number(draft.emi);
  const owed = loan && emi > 0 && /^\d{4}-\d{2}-\d{2}$/.test(draft.lastEmiOn) ? loanBalance(emi, draft.lastEmiOn, todayIso) : null;

  const pickSource = (value: MeasureSource) => {
    const r = latest[value];
    onChange({ source: value, start: isBodySource(value) && r ? String(r.value) : value === draft.source ? draft.start : "" });
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div>
        <label htmlFor="target_source" className={FIELD_LABEL}>
          Which number
        </label>
        <select id="target_source" value={draft.source} onChange={(e) => pickSource(e.target.value as MeasureSource)} className={INPUT}>
          {MEASURE_SOURCES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.value === "manual" ? "Something else (I'll enter it monthly)" : s.label}
            </option>
          ))}
        </select>
        <p className={FIELD_HINT}>{source.hint}</p>
      </div>

      {manual && (
        <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
          <div>
            <label htmlFor="target_label" className={FIELD_LABEL}>
              Name it
            </label>
            <input
              id="target_label"
              value={draft.label}
              maxLength={80}
              onChange={(e) => onChange({ label: e.target.value })}
              placeholder="Monthly profit"
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="target_unit" className={FIELD_LABEL}>
              In
            </label>
            <select id="target_unit" value={draft.unit} onChange={(e) => onChange({ unit: e.target.value })} className={INPUT}>
              {MANUAL_UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {loan && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="target_emi" className={FIELD_LABEL}>
              EMI (₹ a month)
            </label>
            <input id="target_emi" inputMode="decimal" value={draft.emi} onChange={(e) => onChange({ emi: e.target.value })} placeholder="49000" className={INPUT} />
          </div>
          <div>
            <label htmlFor="target_last_emi" className={FIELD_LABEL}>
              Last EMI
            </label>
            <input id="target_last_emi" type="date" min={todayIso} value={draft.lastEmiOn} onChange={(e) => onChange({ lastEmiOn: e.target.value })} className={INPUT} />
          </div>
          {owed !== null && <p className="text-xs text-muted-foreground sm:col-span-2">About {formatMeasure(owed, "inr")} left today. It goes down by itself each month.</p>}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {!loan && (
          <div>
            <label htmlFor="target_start" className={FIELD_LABEL}>
              Where you are now{unit ? ` (${unit === "inr" ? "₹" : unit})` : ""}
            </label>
            <input
              id="target_start"
              inputMode="decimal"
              value={draft.start}
              onChange={(e) => onChange({ start: e.target.value })}
              placeholder={manual ? "100000" : "95"}
              className={INPUT}
            />
            {reading && isBodySource(draft.source) && (
              <p className={FIELD_HINT}>
                Latest in Health: {formatMeasure(reading.value, source.unit)} on {format(new Date(`${reading.on}T00:00:00`), "d MMM")}
              </p>
            )}
          </div>
        )}
        <div>
          <label htmlFor="target_value" className={FIELD_LABEL}>
            Where you want to be{unit ? ` (${unit === "inr" ? "₹" : unit})` : ""}
          </label>
          <input
            id="target_value"
            inputMode="decimal"
            value={draft.target}
            onChange={(e) => onChange({ target: e.target.value })}
            placeholder={loan ? "0" : manual ? "140000" : "88"}
            className={INPUT}
          />
          <p className={FIELD_HINT}>By the end date. Add checkpoints in between on the goal page.</p>
        </div>
      </div>
    </div>
  );
}

export type HabitDraft = { source: LeverSource; perWeek: string; floor: string };

export const EMPTY_HABIT: HabitDraft = { source: "strength", perWeek: "4", floor: "" };

export function HabitFields({ draft, onChange }: { draft: HabitDraft; onChange: (patch: Partial<HabitDraft>) => void }) {
  const source = LEVER_SOURCES.find((s) => s.value === draft.source) ?? LEVER_SOURCES[0];
  const hours = draft.source === "linked_hours";
  const per = Number(draft.perWeek);
  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div>
        <label htmlFor="habit_source" className={FIELD_LABEL}>
          What counts
        </label>
        <select id="habit_source" value={draft.source} onChange={(e) => onChange({ source: e.target.value as LeverSource })} className={INPUT}>
          {LEVER_SOURCES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <p className={FIELD_HINT}>{source.hint}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="habit_per_week" className={FIELD_LABEL}>
            {hours ? "Hours a week" : "Times a week"}
          </label>
          <input id="habit_per_week" inputMode="decimal" value={draft.perWeek} onChange={(e) => onChange({ perWeek: e.target.value })} className={INPUT} />
        </div>
        <div>
          <label htmlFor="habit_floor" className={FIELD_LABEL}>
            Hard-week minimum
          </label>
          <input
            id="habit_floor"
            inputMode="decimal"
            value={draft.floor}
            onChange={(e) => onChange({ floor: e.target.value })}
            placeholder={per > 0 ? String(Math.ceil(per / 2)) : ""}
            className={INPUT}
          />
        </div>
      </div>
      <p className={FIELD_HINT}>A week counts as kept once it reaches the minimum, so one bad week doesn&apos;t undo the habit.</p>
    </div>
  );
}

/** Numbers from a draft, or the message to show. */
export function readHabitDraft(d: HabitDraft): { source: LeverSource; perWeek: number; floor: number } | string {
  const perWeek = Number(d.perWeek);
  if (!Number.isFinite(perWeek) || perWeek <= 0) return "Say how many times a week.";
  const floor = d.floor.trim() === "" ? Math.ceil(perWeek / 2) : Number(d.floor);
  if (!Number.isFinite(floor) || floor < 0) return "The minimum should be a number.";
  if (floor > perWeek) return "The minimum can't be more than the weekly target.";
  return { source: d.source, perWeek, floor };
}

export type TargetInput = {
  source: MeasureSource;
  label: string;
  unit: string;
  start: number | null;
  target: number;
  loan: { emi: number; lastEmiOn: string } | null;
};

export function readTargetDraft(d: TargetDraft): TargetInput | string {
  const source = MEASURE_SOURCES.find((s) => s.value === d.source) ?? MEASURE_SOURCES[0];
  const num = (text: string) => (text.trim() === "" ? null : Number(text.replace(/,/g, "")));
  const target = num(d.target);
  if (target === null || !Number.isFinite(target)) return "Say where you want the number to be.";
  if (d.source === "loan_schedule") {
    const emi = num(d.emi);
    if (emi === null || !Number.isFinite(emi) || emi <= 0) return "Add the EMI.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.lastEmiOn)) return "Add the date of the last EMI.";
    return { source: d.source, label: source.label.replace(/ \(.*\)$/, ""), unit: "inr", start: null, target, loan: { emi, lastEmiOn: d.lastEmiOn } };
  }
  const start = num(d.start);
  if (start === null || !Number.isFinite(start)) return "Say where the number is now.";
  if (start === target) return "The target needs to be different from where you are now.";
  if (d.source === "manual") {
    if (!d.label.trim()) return "Name the number, like Monthly profit.";
    return { source: d.source, label: d.label.trim(), unit: d.unit, start, target, loan: null };
  }
  return { source: d.source, label: source.label.replace(/ \(.*\)$/, ""), unit: source.unit, start, target, loan: null };
}
