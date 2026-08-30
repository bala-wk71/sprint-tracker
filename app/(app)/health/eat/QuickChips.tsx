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
  foods: FoodRow[];
  templates: TemplateRow[];
  query: string;
};

/** How many chips to offer before the user has typed anything. */
const IDLE_LIMIT = 12;

function matches(haystack: string | null, needle: string): boolean {
  return (haystack ?? "").toLowerCase().includes(needle);
}

/**
 * The path that should carry most days: one tap to re-log something already
 * known, with no typing and no estimate.
 *
 * On a phone this is a single horizontally-scrolling row rather than a
 * wrapping block — twelve chips wrapped at 375px push everything below them
 * off the screen, and the thing below them is the text box.
 */
export function QuickChips({
  logDate,
  mealType,
  foods,
  templates,
  query,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const q = query.trim().toLowerCase();

  const shownTemplates = q
    ? templates.filter((t) => matches(t.template_name, q))
    : templates;

  // Favourites first, then everything else by how recently it was used. Typing
  // widens the net rather than narrowing it: the cap only exists to keep the
  // idle row short.
  const ranked = [...foods].sort(
    (a, b) => Number(b.is_favorite) - Number(a.is_favorite)
  );
  const shownFoods = q
    ? ranked.filter((f) => matches(f.name, q) || matches(f.brand, q))
    : ranked.slice(0, IDLE_LIMIT);

  if (shownTemplates.length === 0 && shownFoods.length === 0) return null;

  const run = (
    id: string,
    action: () => Promise<{ ok: boolean; error?: string }>
  ) => {
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

  return (
    <div>
      {/* Bleeds to the card edge on mobile so a half-visible chip signals
          there is more to the right. */}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
        {shownTemplates.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={pending}
            onClick={() =>
              run(t.id, () => logTemplate({ templateId: t.id, logDate, mealType }))
            }
            className={cn(
              "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-foreground hover:bg-primary/15 disabled:opacity-50",
              busyId === t.id && "opacity-60"
            )}
          >
            <Layers className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="font-medium">{t.template_name}</span>
            <span className="text-xs text-muted-foreground">
              {Math.round(t.kcal)} kcal
            </span>
          </button>
        ))}

        {shownFoods.map((food) => (
          <div
            key={food.id}
            className="flex shrink-0 items-stretch overflow-hidden rounded-md border border-border bg-background"
          >
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(food.id, () => logFood({ foodId: food.id, logDate, mealType }))
              }
              className={cn(
                "flex items-center gap-2 whitespace-nowrap px-3 py-2 text-sm text-foreground hover:bg-accent disabled:opacity-50",
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
