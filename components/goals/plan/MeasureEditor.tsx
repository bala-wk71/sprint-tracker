"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { FIELD_HINT, FIELD_LABEL, INPUT, PillGroup } from "@/components/goals/GoalFormParts";
import {
  CADENCES,
  DIRECTIONS,
  INTERPOLATIONS,
  MEASURE_SOURCES,
  UNIT_OPTIONS,
  measureSource,
  type LadderLevel,
  type MeasureKind,
  type MeasureSource,
} from "@/lib/planning/constants";
import { loanParams, type CheckpointRow, type MeasureRow } from "@/lib/planning/summary";
import type { Baseline, Cadence, Direction, Interpolate } from "@/lib/planning/projection";
import { deleteMeasure, saveMeasure } from "@/app/(app)/goals/plan-actions";
import { CheckpointRows, type CheckpointDraft } from "./CheckpointRows";
import { LadderLevels } from "./LadderLevels";

const KINDS: { value: MeasureKind; label: string }[] = [
  { value: "number", label: "A number" },
  { value: "ladder", label: "Levels (a skill)" },
];

const text = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));
const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(/,/g, "")));

function levelsOf(scale: unknown): LadderLevel[] {
  if (!Array.isArray(scale)) return [];
  return scale.flatMap((l, i) =>
    l && typeof l === "object" ? [{ level: i + 1, title: String(l.title ?? ""), proof: String(l.proof ?? "") }] : []
  );
}

/**
 * Add or edit how a goal is measured and the path it should follow. Money is
 * entered in rupees (1.4 lakh = 140000) and shown back as ₹1.4 L.
 */
export function MeasureEditor({
  goalId,
  todayIso,
  measure,
  checkpoints = [],
  knownBaseline,
  onDone,
}: {
  goalId: string;
  todayIso: string;
  measure?: MeasureRow;
  checkpoints?: CheckpointRow[];
  /** The baseline the path already has (e.g. the first weigh-in), for suggestions. */
  knownBaseline: Baseline | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<MeasureKind>((measure?.kind as MeasureKind) ?? "number");
  const [label, setLabel] = useState(measure?.label ?? "");
  const [source, setSource] = useState<MeasureSource>((measure?.source as MeasureSource) ?? "manual");
  const [unit, setUnit] = useState(measure?.unit ?? "");
  const [direction, setDirection] = useState<Direction>((measure?.direction as Direction) ?? "down");
  const [interpolate, setInterpolate] = useState<Interpolate>((measure?.interpolate as Interpolate) ?? "linear");
  const [cadence, setCadence] = useState<Cadence>((measure?.cadence as Cadence) ?? "monthly");
  const [baselineValue, setBaselineValue] = useState(text(measure?.baseline_value));
  const [baselineOn, setBaselineOn] = useState(measure?.baseline_on ?? "");
  const loan = loanParams(measure?.source_params);
  const [emi, setEmi] = useState(text(loan?.emi));
  const [lastEmiOn, setLastEmiOn] = useState(loan?.lastEmiOn ?? "");
  const [levels, setLevels] = useState<LadderLevel[]>(levelsOf(measure?.scale));
  const [rows, setRows] = useState<CheckpointDraft[]>(
    checkpoints.map((c) => ({
      date: c.target_date,
      label: c.label ?? "",
      min: text(c.min_value),
      max: text(c.max_value),
      relative: c.relative,
      holdUntil: c.hold_until ?? "",
    }))
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ladder = kind === "ladder";
  const auto = source !== "manual";

  const pickSource = (value: MeasureSource) => {
    setSource(value);
    const preset = measureSource(value);
    if (value !== "manual") {
      setUnit(preset.unit);
      setDirection(preset.direction);
      setCadence(preset.cadence);
      if (!label) setLabel(preset.label.replace(/ \(.*\)$/, ""));
    }
  };

  const typedBaseline = num(baselineValue);
  const suggestionBaseline: Baseline | null =
    typedBaseline !== null && baselineOn ? { date: baselineOn, value: typedBaseline } : knownBaseline;

  const submit = () => {
    const checkpointsOut = rows
      .filter((r) => r.date || r.min.trim() || r.max.trim())
      .map((r) => ({
        date: r.date,
        label: r.label.trim() || null,
        min: num(r.min),
        max: ladder ? null : num(r.max),
        relative: ladder ? false : r.relative,
        holdUntil: r.holdUntil || null,
      }));
    if (checkpointsOut.some((c) => !c.date)) return setError("Every checkpoint needs a date.");
    if (checkpointsOut.some((c) => Number.isNaN(c.min) || Number.isNaN(c.max))) {
      return setError("Checkpoints take plain numbers, like 89.5 or 140000.");
    }
    if (typedBaseline !== null && Number.isNaN(typedBaseline)) return setError("The starting value should be a number.");
    const emiValue = num(emi);
    setError(null);
    startTransition(async () => {
      const result = await saveMeasure({
        id: measure?.id,
        goalId,
        label: label.trim(),
        kind,
        unit: unit.trim(),
        direction,
        interpolate,
        source: ladder ? "manual" : source,
        loan: source === "loan_schedule" && emiValue !== null && lastEmiOn ? { emi: emiValue, lastEmiOn } : null,
        cadence,
        baselineValue: typedBaseline,
        baselineOn: baselineOn || null,
        scale: ladder ? levels.filter((l) => l.title.trim()) : [],
        checkpoints: checkpointsOut,
      });
      if (!result.ok) return setError(result.error);
      onDone();
      router.refresh();
    });
  };

  const remove = () => {
    if (!measure || !window.confirm(`Delete "${measure.label}" and its readings?`)) return;
    startTransition(async () => {
      const result = await deleteMeasure(measure.id, goalId);
      if (!result.ok) return setError(result.error);
      onDone();
      router.refresh();
    });
  };

  return (
    <div className="space-y-5 rounded-xl border border-primary/40 bg-background p-4">
      <PillGroup label="What kind of measure" value={kind} options={KINDS} onChange={setKind} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="m_label" className={FIELD_LABEL}>Name</label>
          <input
            id="m_label"
            value={label}
            maxLength={80}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={ladder ? "Embedded skill level" : "Company profit per month"}
            className={INPUT}
          />
        </div>
        {!ladder && (
          <div>
            <label htmlFor="m_source" className={FIELD_LABEL}>Where the number comes from</label>
            <select id="m_source" value={source} onChange={(e) => pickSource(e.target.value as MeasureSource)} className={INPUT}>
              {MEASURE_SOURCES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <p className={FIELD_HINT}>{measureSource(source).hint}</p>
          </div>
        )}
      </div>

      {source === "loan_schedule" && !ladder && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="m_emi" className={FIELD_LABEL}>EMI (₹ per month)</label>
            <input id="m_emi" inputMode="decimal" value={emi} onChange={(e) => setEmi(e.target.value)} placeholder="13000" className={INPUT} />
          </div>
          <div>
            <label htmlFor="m_last_emi" className={FIELD_LABEL}>Date of the last EMI</label>
            <input id="m_last_emi" type="date" value={lastEmiOn} onChange={(e) => setLastEmiOn(e.target.value)} className={INPUT} />
          </div>
        </div>
      )}

      {!ladder && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="m_unit" className={FIELD_LABEL}>Unit</label>
            <input
              id="m_unit"
              list="m_unit_options"
              value={unit}
              maxLength={20}
              disabled={auto}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="kg, cm, %, inr, hours"
              className={cn(INPUT, auto && "opacity-60")}
            />
            <datalist id="m_unit_options">
              {UNIT_OPTIONS.filter((u) => u.value !== "level").map((u) => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </datalist>
            <p className={FIELD_HINT}>Use “inr” for money, entered in rupees.</p>
          </div>
          <div>
            <label htmlFor="m_cadence" className={FIELD_LABEL}>How often you&apos;ll check</label>
            <select id="m_cadence" value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)} className={INPUT}>
              {CADENCES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <p className={FIELD_HINT}>{auto ? "Filled in automatically; nothing to type." : "You'll be reminded when a reading is due."}</p>
          </div>
        </div>
      )}

      {!ladder && (
        <>
          <PillGroup label="Which way is better" hint={DIRECTIONS.find((d) => d.value === direction)?.hint} value={direction} options={DIRECTIONS} onChange={setDirection} />
          <PillGroup label="How it moves" hint={INTERPOLATIONS.find((i) => i.value === interpolate)?.hint} value={interpolate} options={INTERPOLATIONS} onChange={setInterpolate} />
        </>
      )}

      {ladder && <LadderLevels levels={levels} onChange={setLevels} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="m_base" className={FIELD_LABEL}>{ladder ? "Level you're at now" : "Where you're starting"}</label>
          <input id="m_base" inputMode="decimal" value={baselineValue} onChange={(e) => setBaselineValue(e.target.value)} placeholder={auto ? "From your first reading" : ""} className={INPUT} />
        </div>
        <div>
          <label htmlFor="m_base_on" className={FIELD_LABEL}>On</label>
          <input id="m_base_on" type="date" max={todayIso} value={baselineOn} onChange={(e) => setBaselineOn(e.target.value)} className={INPUT} />
        </div>
        <p className={cn(FIELD_HINT, "-mt-2 sm:col-span-2")}>
          Leave empty to start from the first reading. Targets like “down 4–5 cm” wait for it.
        </p>
      </div>

      <CheckpointRows rows={rows} onChange={setRows} ladder={ladder} baseline={suggestionBaseline} interpolate={ladder ? "step" : interpolate} />

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={submit} disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {pending ? "Saving…" : measure ? "Save measure" : "Add measure"}
        </button>
        <button type="button" onClick={onDone} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
        {measure && (
          <button type="button" onClick={remove} disabled={pending} className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-destructive">
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
