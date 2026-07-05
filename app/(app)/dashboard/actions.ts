"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { awardXp } from "@/lib/gamification";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

const reflectionSchema = z.object({
  sprint_id: z.string().uuid(),
  reflection_went_well: z.string().trim().max(2000),
  reflection_improve: z.string().trim().max(2000),
  reflection_lesson: z.string().trim().max(2000),
});

export type WeeklyReflectionInput = z.infer<typeof reflectionSchema>;

export async function saveWeeklyReflection(
  input: WeeklyReflectionInput
): Promise<ActionResult> {
  const parsed = reflectionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { error } = await supabase
    .from("sprints")
    .update({
      reflection_went_well: parsed.data.reflection_went_well || null,
      reflection_improve: parsed.data.reflection_improve || null,
      reflection_lesson: parsed.data.reflection_lesson || null,
    })
    .eq("id", parsed.data.sprint_id)
    .eq("owner_id", user.id);

  if (error) return { ok: false, error: error.message };

  // Reflection XP once per sprint, only when all three prompts are answered.
  if (
    parsed.data.reflection_went_well &&
    parsed.data.reflection_improve &&
    parsed.data.reflection_lesson
  ) {
    await awardXp(supabase, user.id, "weekly_reflection", parsed.data.sprint_id);
  }

  revalidatePath("/dashboard");
  return { ok: true };
}
