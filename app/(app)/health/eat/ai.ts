"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateJson } from "@/lib/ai/gemini";
import {
  MEAL_PARSE_RESPONSE_SCHEMA,
  getMealParsePrompt,
  mealParseResultSchema,
  type ParsedFoodItem,
} from "@/lib/ai/health";
import type { ActionResult } from "./actions";

/**
 * The user's own foods are handed to the model as vocabulary so that a second
 * helping of "amma's sambar" comes back with the name it already has, links to
 * the saved entry, and reuses the macros they already corrected once.
 */
const KNOWN_FOOD_LIMIT = 60;

export async function parseMealText(
  rawText: string
): Promise<ActionResult<{ items: ParsedFoodItem[] }>> {
  const parsed = z.string().trim().min(2).max(2000).safeParse(rawText);
  if (!parsed.success)
    return { ok: false, error: "Write out what you ate first." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { data: knownFoods } = await supabase
    .from("foods")
    .select("name")
    .eq("owner_id", user.id)
    .order("times_used", { ascending: false })
    .limit(KNOWN_FOOD_LIMIT);

  try {
    const raw = await generateJson(
      getMealParsePrompt((knownFoods ?? []).map((f) => f.name)),
      [{ role: "user", parts: [{ text: parsed.data }] }],
      MEAL_PARSE_RESPONSE_SCHEMA
    );

    const result = mealParseResultSchema.safeParse(raw);
    if (!result.success)
      return { ok: false, error: "The estimate came back unreadable. Try again." };

    if (result.data.items.length === 0)
      return { ok: false, error: "No food found in that. Try naming the dishes." };

    return { ok: true, data: { items: result.data.items } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "The estimate failed.",
    };
  }
}
