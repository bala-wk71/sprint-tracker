import Link from "next/link";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createClient, getUser } from "@/lib/supabase/server";
import { todayIsoLocal } from "@/lib/dates";
import { readHealthProfile } from "@/lib/health/profile";
import { defaultMealType, MEAL_TYPES } from "@/lib/health/constants";
import { sumMacros, ZERO_MACROS } from "@/lib/health/units";
import { MacroTotals } from "@/components/health/MacroTotals";
import { LogCard } from "./LogCard";
import { DayMeals } from "./DayMeals";
import type { FoodRow, MealItemRow, MealRow, TemplateRow } from "./types";

function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function shiftIso(date: string, days: number): string {
  return format(
    new Date(Date.parse(`${date}T00:00:00`) + days * 86_400_000),
    "yyyy-MM-dd"
  );
}

const MEAL_ORDER = MEAL_TYPES.map((m) => m.value);

export default async function EatPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const todayIso = await todayIsoLocal();
  const date =
    params.date && isValidIsoDate(params.date) ? params.date : todayIso;

  const [profile, { data: mealRows }, { data: foodRows }, { data: templateRows }] =
    await Promise.all([
      readHealthProfile(supabase, user.id),
      supabase
        .from("meals")
        .select("id, meal_type, eaten_at, raw_text")
        .eq("owner_id", user.id)
        .eq("log_date", date)
        .eq("is_template", false)
        .order("created_at"),
      supabase
        .from("foods")
        .select(
          "id, name, brand, serving_qty, serving_unit, kcal, protein_g, carbs_g, fat_g, fiber_g, is_favorite, times_used"
        )
        .eq("owner_id", user.id)
        .order("last_used_at", { ascending: false, nullsFirst: false })
        .limit(60),
      supabase
        .from("meals")
        .select("id, template_name")
        .eq("owner_id", user.id)
        .eq("is_template", true)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

  const mealIds = (mealRows ?? []).map((m) => m.id);
  const templateIds = (templateRows ?? []).map((t) => t.id);

  const { data: itemRows } =
    mealIds.length + templateIds.length > 0
      ? await supabase
          .from("meal_items")
          .select(
            "id, meal_id, food_id, position, name, qty, unit, kcal, protein_g, carbs_g, fat_g, fiber_g"
          )
          .in("meal_id", [...mealIds, ...templateIds])
          .order("position")
      : { data: [] as never[] };

  const itemsByMeal = new Map<string, MealItemRow[]>();
  for (const row of itemRows ?? []) {
    const list = itemsByMeal.get(row.meal_id) ?? [];
    list.push({
      id: row.id,
      food_id: row.food_id,
      position: row.position,
      name: row.name,
      qty: Number(row.qty),
      unit: row.unit,
      kcal: Number(row.kcal),
      protein_g: Number(row.protein_g),
      carbs_g: Number(row.carbs_g),
      fat_g: Number(row.fat_g),
      fiber_g: Number(row.fiber_g),
    });
    itemsByMeal.set(row.meal_id, list);
  }

  const meals: MealRow[] = (mealRows ?? [])
    .map((m) => ({
      id: m.id,
      meal_type: m.meal_type,
      eaten_at: m.eaten_at,
      raw_text: m.raw_text,
      items: itemsByMeal.get(m.id) ?? [],
    }))
    // Breakfast to snack rather than by the time the row was created — the
    // day reads as a day, not as an audit trail of when things were typed.
    .sort(
      (a, b) =>
        MEAL_ORDER.indexOf(a.meal_type) - MEAL_ORDER.indexOf(b.meal_type)
    );

  const templates: TemplateRow[] = (templateRows ?? []).map((t) => {
    const items = itemsByMeal.get(t.id) ?? [];
    return {
      id: t.id,
      template_name: t.template_name ?? "Combo",
      itemCount: items.length,
      kcal: items.reduce((s, i) => s + i.kcal, 0),
      protein_g: items.reduce((s, i) => s + i.protein_g, 0),
    };
  });

  const foods: FoodRow[] = (foodRows ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    brand: f.brand,
    serving_qty: Number(f.serving_qty),
    serving_unit: f.serving_unit,
    kcal: Number(f.kcal),
    protein_g: Number(f.protein_g),
    carbs_g: Number(f.carbs_g),
    fat_g: Number(f.fat_g),
    fiber_g: Number(f.fiber_g),
    is_favorite: f.is_favorite,
    times_used: f.times_used,
  }));

  const allItems = meals.flatMap((m) => m.items);
  const totals = allItems.length > 0 ? sumMacros(allItems) : { ...ZERO_MACROS };

  // Which meal a one-tap re-log lands in. On today that follows the clock; on
  // a past day there is no "now", so it falls back to dinner.
  const suggestedMeal =
    date === todayIso ? defaultMealType(new Date().getHours()) : "dinner";

  const isToday = date === todayIso;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/health/eat?date=${shiftIso(date, -1)}`}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Prev</span>
        </Link>
        <span className="text-sm font-medium text-foreground">
          {format(new Date(`${date}T00:00:00`), "EEE, d MMM yyyy")}
        </span>
        <Link
          href={
            shiftIso(date, 1) === todayIso
              ? "/health/eat"
              : `/health/eat?date=${shiftIso(date, 1)}`
          }
          className={`inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent ${
            isToday ? "pointer-events-none opacity-40" : ""
          }`}
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
        {!isToday && (
          <Link
            href="/health/eat"
            className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Today
          </Link>
        )}
      </div>

      <MacroTotals
        totals={totals}
        kcalGoal={profile.daily_kcal_goal}
        proteinGoal={profile.daily_protein_g_goal}
      />

      <LogCard
        logDate={date}
        defaultMealType={suggestedMeal}
        foods={foods}
        templates={templates}
      />

      <DayMeals meals={meals} />
    </div>
  );
}
