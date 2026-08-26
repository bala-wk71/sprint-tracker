"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, getUser } from "@/lib/supabase/server";

export type PreferenceResult = { ok: true } | { ok: false; error: string };

const preferencesSchema = z.object({
  weekStartDay: z.number().int().min(0).max(6).optional(),
  todoAutoArchive: z.boolean().optional(),
});

/**
 * Save the profile-level preferences.
 *
 * `week_start_day` decides where every sprint week begins, so changing it
 * changes which sprint the dashboard, the daily page and the analytics look
 * up — hence the broad revalidation.
 */
export async function updatePreferences(
  input: z.infer<typeof preferencesSchema>
): Promise<PreferenceResult> {
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const user = await getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const updates: { week_start_day?: number; todo_auto_archive?: boolean } = {};
  if (parsed.data.weekStartDay !== undefined)
    updates.week_start_day = parsed.data.weekStartDay;
  if (parsed.data.todoAutoArchive !== undefined)
    updates.todo_auto_archive = parsed.data.todoAutoArchive;

  if (Object.keys(updates).length === 0) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase
    .from("users")
    .update(updates)
    .eq("id", user.id);

  if (error) return { ok: false, error: error.message };

  for (const path of [
    "/settings",
    "/dashboard",
    "/daily",
    "/analytics",
    "/sprint/setup",
    "/todo",
    "/health",
  ]) {
    revalidatePath(path);
  }

  return { ok: true };
}
