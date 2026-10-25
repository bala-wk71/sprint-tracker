"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Trash2 } from "lucide-react";
import { MEAL_TYPES, type MealType } from "@/lib/health/constants";
import { announceXp } from "@/lib/xpToast";
import type { ParsedDayMeal } from "@/lib/ai/health";
import { parseDayFood, saveDayFood } from "./actions";
import type { WrapupMeal } from "./load";

const NUM =
  "h-9 w-full rounded-md border border-border bg-background px-2 text-center text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary";

type DraftMeal = { key: string; mealType: MealType; said: string; items: (ParsedDayMeal["items"][number] & { key: string })[] };

const mealLabel = (t: MealType) => MEAL_TYPES.find((m) => m.value === t)?.label ?? t;

export function DayFoodPanel({
  date,
  meals,
  kcalGoal,
  proteinGoal,
}: {
  date: string;
  meals: WrapupMeal[];
  kcalGoal: number | null;
  proteinGoal: number | null;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<DraftMeal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const kcal = meals.reduce((s, m) => s + m.kcal, 0);
  const protein = meals.reduce((s, m) => s + m.protein_g, 0);

  const read = () =>
    startTransition(async () => {
      setError(null);
      const result = await parseDayFood(text);
      if (!result.ok) return setError(result.error);
      setDraft(
        result.data.meals.map((m, i) => ({
          key: `m${i}`,
          mealType: m.meal_type,
          said: m.said,
          items: m.items.map((item, j) => ({ ...item, key: `m${i}i${j}` })),
        }))
      );
    });

  const save = () =>
    startTransition(async () => {
      if (!draft) return;
      setError(null);
      const result = await saveDayFood({
        logDate: date,
        meals: draft
          .filter((m) => m.items.length > 0)
          .map((m) => ({
            mealType: m.mealType,
            said: m.said,
            items: m.items.map((i) => ({
              name: i.name,
              qty: i.qty,
              unit: i.unit,
              kcal: i.kcal,
              protein_g: i.protein_g,
              carbs_g: i.carbs_g,
              fat_g: i.fat_g,
              fiber_g: i.fiber_g ?? null,
            })),
          })),
      });
      if (!result.ok) return setError(result.error);
      announceXp(result.xp, "Food logged");
      setDraft(null);
      setText("");
      router.refresh();
    });

  const patchMeal = (key: string, patch: Partial<DraftMeal>) =>
    setDraft((d) => d?.map((m) => (m.key === key ? { ...m, ...patch } : m)) ?? null);
  const patchItem = (mealKey: string, itemKey: string, patch: { kcal?: number; protein_g?: number }) =>
    setDraft((d) =>
      d?.map((m) => (m.key === mealKey ? { ...m, items: m.items.map((i) => (i.key === itemKey ? { ...i, ...patch } : i)) } : m)) ?? null
    );
  const removeItem = (mealKey: string, itemKey: string) =>
    setDraft((d) => d?.map((m) => (m.key === mealKey ? { ...m, items: m.items.filter((i) => i.key !== itemKey) } : m)) ?? null);

  const draftKcal = Math.round(draft?.reduce((s, m) => s + m.items.reduce((t, i) => t + i.kcal, 0), 0) ?? 0);
  const draftProtein = Math.round(draft?.reduce((s, m) => s + m.items.reduce((t, i) => t + i.protein_g, 0), 0) ?? 0);

  return (
    <div className="space-y-3">
      {meals.length > 0 && (
        <div className="rounded-md border border-border bg-background p-3 text-sm">
          <p className="font-medium text-foreground">
            {kcal.toLocaleString()} kcal{kcalGoal ? ` of ${kcalGoal.toLocaleString()}` : ""} · {protein} g protein
            {proteinGoal ? ` of ${proteinGoal} g` : ""}
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {meals.map((m) => (
              <li key={m.id} className="truncate">
                {mealLabel(m.mealType)} · {m.kcal} kcal · {m.protein_g} g{m.said ? ` · ${m.said}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!draft && (
        <>
          <label htmlFor="day_food" className="block text-sm font-medium text-foreground">
            {meals.length > 0 ? "Anything else you ate?" : "What did you eat today?"}
          </label>
          <textarea
            id="day_food"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={3000}
            placeholder="Morning 4 idly with sambar, filter coffee. Lunch 250 g rice, rasam, poriyal. Evening 2 tea. Night 2 chapathi with egg curry"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={read}
              disabled={pending || text.trim().length < 2}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              {pending ? "Reading…" : "Work out the numbers"}
            </button>
            {!kcalGoal && (
              <Link href="/health/goals" className="text-xs text-primary hover:underline">
                Set a calorie target
              </Link>
            )}
          </div>
        </>
      )}

      {draft && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">
            Check the numbers <span className="font-normal text-muted-foreground">· {draftKcal} kcal · {draftProtein} g protein</span>
          </p>
          {draft.map((meal) => (
            <div key={meal.key} className="space-y-2 rounded-md border border-border bg-background p-3">
              <select
                value={meal.mealType}
                onChange={(e) => patchMeal(meal.key, { mealType: e.target.value as MealType })}
                aria-label="Meal"
                className="rounded-md border border-border bg-background px-2 py-1 text-sm font-medium text-foreground"
              >
                {MEAL_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              {meal.items.map((item) => (
                <div key={item.key} className="grid grid-cols-[1fr_4.5rem_4rem_auto] items-center gap-2">
                  <p className="min-w-0 text-sm text-foreground">
                    <span className="block truncate">{item.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.qty} {item.unit}{item.confidence === "low" ? " · rough guess" : ""}
                    </span>
                  </p>
                  <input
                    aria-label={`${item.name} kcal`}
                    inputMode="numeric"
                    value={Math.round(item.kcal)}
                    onChange={(e) => patchItem(meal.key, item.key, { kcal: Number(e.target.value) || 0 })}
                    className={NUM}
                  />
                  <input
                    aria-label={`${item.name} protein grams`}
                    inputMode="numeric"
                    value={Math.round(item.protein_g)}
                    onChange={(e) => patchItem(meal.key, item.key, { protein_g: Number(e.target.value) || 0 })}
                    className={NUM}
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(meal.key, item.key)}
                    aria-label={`Remove ${item.name}`}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <p className="text-right text-[11px] text-muted-foreground">kcal · protein g</p>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save the day's food"}
            </button>
            <button type="button" onClick={() => setDraft(null)} className="text-sm text-muted-foreground hover:text-foreground">
              Back
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
