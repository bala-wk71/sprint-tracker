"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Layers, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MealType } from "@/lib/health/constants";
import { logFood, logTemplate, toggleFavorite } from "./actions";
import type { FoodRow, TemplateRow } from "./types";

type Props = {
  logDate: string;
  mealType: MealType;
  favorites: FoodRow[];
  recents: FoodRow[];
  templates: TemplateRow[];
};

/**
 * The path that should carry most days: one tap to re-log something already
 * known, with no typing and no estimate. The AI parse exists for the first
 * time you eat a thing; this is for every time after.
 */
export function QuickStrip({
  logDate,
  mealType,
  favorites,
  recents,
  templates,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (favorites.length === 0 && recents.length === 0 && templates.length === 0)
    return null;

  const run = (id: string, action: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const result = await action();
      setBusyId(null);
      if (!result.ok) {
        setError(result.error ?? "Could not log that.");
        return;
      }
      router.refresh();
    });
  };

  // Favourites first, then recents that aren't already shown as favourites.
  const favoriteIds = new Set(favorites.map((f) => f.id));
  const shownRecents = recents.filter((f) => !favoriteIds.has(f.id)).slice(0, 12);

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <h2 className="text-sm font-semibold text-foreground">
        Log again in one tap
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Adds to {mealType}. Numbers come from the last time you logged it.
      </p>

      {templates.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={pending}
              onClick={() =>
                run(t.id, () =>
                  logTemplate({ templateId: t.id, logDate, mealType })
                )
              }
              className={cn(
                "flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-foreground hover:bg-primary/15 disabled:opacity-50",
                busyId === t.id && "opacity-60"
              )}
            >
              <Layers className="h-3.5 w-3.5 text-primary" />
              <span className="font-medium">{t.template_name}</span>
              <span className="text-xs text-muted-foreground">
                {Math.round(t.kcal)} kcal
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {[...favorites, ...shownRecents].map((food) => (
          <div
            key={food.id}
            className="flex items-stretch overflow-hidden rounded-md border border-border bg-background"
          >
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(food.id, () =>
                  logFood({ foodId: food.id, logDate, mealType })
                )
              }
              className={cn(
                "flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent disabled:opacity-50",
                busyId === food.id && "opacity-60"
              )}
            >
              <span className="font-medium">{food.name}</span>
              <span className="text-xs text-muted-foreground">
                {Math.round(food.kcal * food.serving_qty)} kcal
              </span>
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(`fav-${food.id}`, () =>
                  toggleFavorite({
                    foodId: food.id,
                    isFavorite: !food.is_favorite,
                  })
                )
              }
              aria-label={
                food.is_favorite
                  ? `Remove ${food.name} from favourites`
                  : `Make ${food.name} a favourite`
              }
              className="border-l border-border px-2 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Star
                className={cn(
                  "h-3.5 w-3.5",
                  food.is_favorite && "fill-primary text-primary"
                )}
              />
            </button>
          </div>
        ))}
      </div>

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
