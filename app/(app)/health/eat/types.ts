import type { MealType } from "@/lib/health/constants";

export type MealItemRow = {
  id: string;
  food_id: string | null;
  position: number;
  name: string;
  qty: number;
  unit: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
};

export type MealRow = {
  id: string;
  meal_type: MealType;
  eaten_at: string | null;
  raw_text: string | null;
  items: MealItemRow[];
};

export type FoodRow = {
  id: string;
  name: string;
  brand: string | null;
  serving_qty: number;
  serving_unit: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  is_favorite: boolean;
  times_used: number;
};

/** A saved combo — "usual breakfast" — with its items already summed. */
export type TemplateRow = {
  id: string;
  template_name: string;
  itemCount: number;
  kcal: number;
  protein_g: number;
};

/** A parsed-but-unsaved row in the composer, editable before it is committed. */
export type DraftItem = {
  key: string;
  name: string;
  qty: number;
  unit: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  confidence: "high" | "low";
};
