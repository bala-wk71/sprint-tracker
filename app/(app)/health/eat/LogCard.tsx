"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { MEAL_TYPES, type MealType } from "@/lib/health/constants";
import { parseMealText } from "./ai";
import { saveMeal } from "./actions";
import { DraftEditor } from "./DraftEditor";
import { QuickChips } from "./QuickChips";
import type { DraftItem, FoodRow, TemplateRow } from "./types";

type Props = {
  logDate: string;
  defaultMealType: MealType;
  foods: FoodRow[];
  templates: TemplateRow[];
};

/**
 * One card for the whole act of logging, because on a phone two cards meant
 * the text box started below the fold.
 *
 * The single box does double duty: it filters what you have eaten before, and
 * if nothing matches it is the sentence the estimator reads. Typing narrows
 * the one-tap row instead of scrolling past it.
 */
export function LogCard({
  logDate,
  defaultMealType,
  foods,
  templates,
}: Props) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [mealType, setMealType] = useState<MealType>(defaultMealType);
  const [draft, setDraft] = useState<DraftItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [xpGained, setXpGained] = useState(0);
  const [parsing, startParsing] = useTransition();
  const [saving, startSaving] = useTransition();

  const canEstimate = text.trim().length >= 2;

  const estimate = () => {
    if (!canEstimate) return;
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

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
      {/* Meal type scrolls rather than wraps so it never costs a second row. */}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {MEAL_TYPES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMealType(m.value)}
            className={cn(
              "shrink-0 rounded-md border px-3 py-1.5 text-sm transition-colors",
              mealType === m.value
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              estimate();
            }
          }}
          enterKeyHint="go"
          placeholder="Find a food, or describe the meal"
          aria-label="Find a food, or describe the meal"
          className="h-11 w-full rounded-md border border-border bg-background pl-9 pr-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="mt-3">
        <QuickChips
          logDate={logDate}
          mealType={mealType}
          foods={foods}
          templates={templates}
          query={text}
        />
      </div>

      {canEstimate && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={estimate}
            disabled={parsing}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {parsing ? "Working it out…" : "Estimate this"}
          </button>
          <span className="text-xs text-muted-foreground">
            Adds to {mealType}
          </span>
        </div>
      )}

      {(error || xpGained > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {xpGained > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              +{xpGained} XP
            </span>
          )}
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      )}

      {draft && (
        <DraftEditor
          draft={draft}
          mealType={mealType}
          saving={saving}
          onEdit={(key, patch) =>
            setDraft((rows) =>
              rows ? rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) : rows
            )
          }
          onRemove={(key) =>
            setDraft((rows) => (rows ? rows.filter((r) => r.key !== key) : rows))
          }
          onSave={save}
          onDiscard={() => setDraft(null)}
        />
      )}
    </div>
  );
}
