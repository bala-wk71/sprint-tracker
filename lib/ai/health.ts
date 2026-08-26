import { z } from "zod";
import type { ResponseSchema } from "./gemini";

/** Shape Gemini is pinned to when reading a typed-out meal. */
export const MEAL_PARSE_RESPONSE_SCHEMA: ResponseSchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          qty: { type: "number" },
          unit: { type: "string" },
          kcal: { type: "number" },
          protein_g: { type: "number" },
          carbs_g: { type: "number" },
          fat_g: { type: "number" },
          fiber_g: { type: "number" },
          confidence: { type: "string", enum: ["high", "low"] },
        },
        required: ["name", "qty", "unit", "kcal", "protein_g", "carbs_g", "fat_g"],
      },
    },
  },
  required: ["items"],
};

/**
 * Forgiving on purpose: a missing fibre figure or a nonsense negative should
 * cost that one number, not throw away a meal the user has already typed.
 */
export const mealParseResultSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        qty: z.number().positive().max(10_000).catch(1),
        unit: z.string().trim().min(1).max(30).catch("serving"),
        kcal: z.number().min(0).max(10_000).catch(0),
        protein_g: z.number().min(0).max(1000).catch(0),
        carbs_g: z.number().min(0).max(1000).catch(0),
        fat_g: z.number().min(0).max(1000).catch(0),
        fiber_g: z.number().min(0).max(1000).optional().nullable().catch(null),
        confidence: z.enum(["high", "low"]).catch("low"),
      })
    )
    .max(30),
});

export type ParsedFoodItem = z.infer<typeof mealParseResultSchema>["items"][number];

/**
 * The estimator's brief.
 *
 * Two things matter more than precision here. First, the totals have to be
 * *plausible* — a number that is quietly 40% low is worse than one the user
 * can see is wrong and correct. Second, it must not invent portions: "dal"
 * with no quantity means one normal serving, not an unstated 400g.
 */
export function getMealParsePrompt(knownFoods: string[]): string {
  const known =
    knownFoods.length > 0
      ? `\n\nThe person has logged these foods before. When one of them clearly
matches what they typed, reuse the exact name so it links to their saved
entry:\n${knownFoods.map((f) => `- ${f}`).join("\n")}`
      : "";

  return `You convert a short description of a meal into food items with
estimated nutrition.

Rules:
- One item per distinct food. "Rice and dal" is two items.
- qty and unit describe the portion as a person would say it: 2 "roti",
  1 "cup", 150 "g", 1 "serving". Never invent a precise gram weight the
  person did not give — use a normal serving of that food instead.
- kcal, protein_g, carbs_g and fat_g are for the WHOLE portion given in qty,
  not per 100g and not per single unit.
- Keep the macros arithmetically consistent with the calories
  (protein x4 + carbs x4 + fat x9 should land within about 10% of kcal).
- Estimate for the food as it is normally cooked and eaten in the person's
  own kitchen. Assume home cooking with normal amounts of oil unless they
  say otherwise.
- Use the person's own words for the name ("amma's sambar", not "lentil stew").
- Set confidence "low" when the portion is genuinely ambiguous or the dish is
  one whose recipe varies a lot.
- Drinks count. Water, black coffee and plain tea are items with 0 kcal.
- If the text describes no food at all, return an empty list.${known}`;
}
