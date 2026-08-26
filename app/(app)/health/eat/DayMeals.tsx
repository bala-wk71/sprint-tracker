"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookmarkPlus, Trash2 } from "lucide-react";
import { MEAL_TYPES } from "@/lib/health/constants";
import { deleteMeal, deleteMealItem, saveAsTemplate } from "./actions";
import type { MealRow } from "./types";

export function DayMeals({ meals }: { meals: MealRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [namingId, setNamingId] = useState<string | null>(null);
  const [comboName, setComboName] = useState("");

  if (meals.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
        <p className="text-sm text-muted-foreground">
          Nothing logged yet today.
        </p>
      </div>
    );
  }

  const run = (action: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong");
        return;
      }
      router.refresh();
    });
  };

  const label = (type: string) =>
    MEAL_TYPES.find((m) => m.value === type)?.label ?? type;

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {meals.map((meal) => {
        const kcal = meal.items.reduce((s, i) => s + Number(i.kcal), 0);
        const protein = meal.items.reduce((s, i) => s + Number(i.protein_g), 0);

        return (
          <div
            key={meal.id}
            className="rounded-xl border border-border bg-card p-4 sm:p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  {label(meal.meal_type)}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {Math.round(kcal)} kcal · {Math.round(protein)}g protein
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setNamingId(meal.id);
                    setComboName(label(meal.meal_type));
                  }}
                  title="Save as a one-tap combo"
                  aria-label="Save as a combo"
                  className="rounded-md px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <BookmarkPlus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => deleteMeal(meal.id))}
                  aria-label={`Delete ${label(meal.meal_type)}`}
                  className="rounded-md px-2 py-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {namingId === meal.id && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-background p-3">
                <input
                  autoFocus
                  value={comboName}
                  onChange={(e) => setComboName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setNamingId(null);
                    if (e.key === "Enter" && comboName.trim()) {
                      run(() =>
                        saveAsTemplate({ mealId: meal.id, name: comboName.trim() })
                      );
                      setNamingId(null);
                    }
                  }}
                  placeholder="Usual breakfast"
                  className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="button"
                  disabled={pending || !comboName.trim()}
                  onClick={() => {
                    run(() =>
                      saveAsTemplate({ mealId: meal.id, name: comboName.trim() })
                    );
                    setNamingId(null);
                  }}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  Save combo
                </button>
                <button
                  type="button"
                  onClick={() => setNamingId(null)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            )}

            <ul className="mt-3 divide-y divide-border">
              {meal.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-foreground">
                      {item.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {Number(item.qty)} {item.unit} · {Math.round(Number(item.protein_g))}
                      p / {Math.round(Number(item.carbs_g))}c /{" "}
                      {Math.round(Number(item.fat_g))}f
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {Math.round(Number(item.kcal))}
                    </span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => deleteMealItem(item.id))}
                      aria-label={`Remove ${item.name}`}
                      className="rounded-md px-1.5 py-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
