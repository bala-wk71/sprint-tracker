"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { MEAL_TYPES, type MealType } from "@/lib/health/constants";
import { kcalFromMacros } from "@/lib/health/units";
import { parseMealText } from "./ai";
import { saveMeal } from "./actions";
import type { DraftItem } from "./types";

const NUM =
  "h-10 w-full rounded-md border border-border bg-background px-2 text-center text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary";

type Props = {
  logDate: string;
  defaultMealType: MealType;
};

export function MealComposer({ logDate, defaultMealType }: Props) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [mealType, setMealType] = useState<MealType>(defaultMealType);
  const [draft, setDraft] = useState<DraftItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [xpGained, setXpGained] = useState(0);
  const [parsing, startParsing] = useTransition();
  const [saving, startSaving] = useTransition();

  const estimate = () => {
    setError(null);
    setXpGained(0);
    startParsing(async () => {
      const result = await parseMealText(text);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraft(
        result.data.items.map((item) => ({
          key: crypto.randomUUID(),
          name: item.name,
          qty: item.qty,
          unit: item.unit,
          kcal: Math.round(item.kcal),
          protein_g: Math.round(item.protein_g),
          carbs_g: Math.round(item.carbs_g),
          fat_g: Math.round(item.fat_g),
          fiber_g: Math.round(item.fiber_g ?? 0),
          confidence: item.confidence,
        }))
      );
    });
  };

  const save = () => {
    if (!draft || draft.length === 0) return;
    setError(null);
    startSaving(async () => {
      const result = await saveMeal({
        logDate,
        mealType,
        rawText: text.trim() || null,
        items: draft.map((d) => ({
          name: d.name,
          qty: d.qty,
          unit: d.unit,
          kcal: d.kcal,
          protein_g: d.protein_g,
          carbs_g: d.carbs_g,
          fat_g: d.fat_g,
          fiber_g: d.fiber_g,
        })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setXpGained("xp" in result && result.xp ? result.xp : 0);
      setDraft(null);
      setText("");
      router.refresh();
    });
  };

  const edit = (key: string, patch: Partial<DraftItem>) =>
    setDraft((rows) =>
      rows ? rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) : rows
    );

  const totals = (draft ?? []).reduce(
    (acc, d) => ({
      kcal: acc.kcal + d.kcal,
      protein: acc.protein + d.protein_g,
    }),
    { kcal: 0, protein: 0 }
  );

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        {MEAL_TYPES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMealType(m.value)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm transition-colors",
              mealType === m.value
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <textarea
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) estimate();
        }}
        placeholder="2 chapati, dal, 1 cup curd, black coffee"
        className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
      />

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={estimate}
          disabled={parsing || text.trim().length < 2}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" />
          {parsing ? "Working it out…" : "Estimate"}
        </button>
        {xpGained > 0 && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            +{xpGained} XP
          </span>
        )}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>

      {/* Every number is editable before anything is saved. An estimate the
          user can see and correct is worth more than a precise-looking one
          they cannot. */}
      {draft && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">
              Check the numbers
            </h3>
            <span className="text-xs text-muted-foreground">
              {totals.kcal} kcal · {totals.protein}g protein
            </span>
          </div>

          <div className="mt-3 space-y-3">
            {draft.map((item) => {
              const implied = kcalFromMacros(item);
              // Macros that don't add up to the calories mean one of the two is
              // wrong, and the user is the only one who can say which.
              const inconsistent =
                item.kcal > 0 && Math.abs(implied - item.kcal) / item.kcal > 0.25;

              return (
                <div
                  key={item.key}
                  className="rounded-md border border-border bg-background p-3"
                >
                  <div className="flex items-center gap-2">
                    <input
                      value={item.name}
                      onChange={(e) => edit(item.key, { name: e.target.value })}
                      className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      aria-label="Food name"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((rows) =>
                          rows ? rows.filter((r) => r.key !== item.key) : rows
                        )
                      }
                      aria-label={`Remove ${item.name}`}
                      className="h-10 shrink-0 rounded-md px-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                    <LabelledNumber
                      label="qty"
                      value={item.qty}
                      onChange={(v) => edit(item.key, { qty: v })}
                    />
                    <div>
                      <span className="mb-1 block text-[11px] text-muted-foreground">
                        unit
                      </span>
                      <input
                        value={item.unit}
                        onChange={(e) => edit(item.key, { unit: e.target.value })}
                        className={NUM}
                        aria-label="Unit"
                      />
                    </div>
                    <LabelledNumber
                      label="kcal"
                      value={item.kcal}
                      onChange={(v) => edit(item.key, { kcal: v })}
                    />
                    <LabelledNumber
                      label="protein"
                      value={item.protein_g}
                      onChange={(v) => edit(item.key, { protein_g: v })}
                    />
                    <LabelledNumber
                      label="carbs"
                      value={item.carbs_g}
                      onChange={(v) => edit(item.key, { carbs_g: v })}
                    />
                    <LabelledNumber
                      label="fat"
                      value={item.fat_g}
                      onChange={(v) => edit(item.key, { fat_g: v })}
                    />
                  </div>

                  {(item.confidence === "low" || inconsistent) && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-[hsl(var(--progress-warning))]">
                      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {inconsistent
                        ? `Macros work out to about ${Math.round(implied)} kcal — worth a look.`
                        : "Rough guess — the portion or the recipe is ambiguous."}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving || draft.length === 0}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Saving…" : `Log ${mealType}`}
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LabelledNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <span className="mb-1 block text-[11px] text-muted-foreground">
        {label}
      </span>
      <input
        type="number"
        inputMode="decimal"
        step="1"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) ? n : 0);
        }}
        className={NUM}
        aria-label={label}
      />
    </div>
  );
}
