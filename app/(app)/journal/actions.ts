"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { awardXp } from "@/lib/gamification";
import { todayIsoLocal } from "@/lib/dates";
import { JOURNAL_MOOD_VALUES } from "@/lib/journal/constants";

export type JournalResult<T = undefined> =
  | ({ ok: true; xp?: number } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

const entrySchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().max(200, "Keep the title under 200 characters."),
  body: z
    .string()
    .trim()
    .min(1, "Write something first.")
    .max(20000, "That entry is too long. Split it into two."),
  mood: z.enum(JOURNAL_MOOD_VALUES).nullable(),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  isPrivate: z.boolean(),
  hideFromCoach: z.boolean(),
});

export type JournalEntryInput = z.input<typeof entrySchema>;

async function getUserOrFail() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

export async function saveJournalEntry(
  input: JournalEntryInput
): Promise<JournalResult<{ id: string }>> {
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid entry." };
  }
  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "You're signed out. Sign in and try again." };

  const v = parsed.data;
  const fields = {
    title: v.title,
    body: v.body,
    mood: v.mood,
    is_private: v.isPrivate,
    hide_from_coach: v.hideFromCoach,
  };

  if (v.id) {
    const { error } = await ctx.supabase
      .from("journal_entries")
      .update(fields)
      .eq("id", v.id)
      .eq("owner_id", ctx.user.id)
      .eq("author", "owner");
    if (error) return { ok: false, error: "Couldn't save your changes. Try again." };
    revalidatePath("/journal");
    revalidatePath(`/journal/${v.id}`);
    return { ok: true, data: { id: v.id } };
  }

  const { data, error } = await ctx.supabase
    .from("journal_entries")
    .insert({ ...fields, owner_id: ctx.user.id, entry_date: v.entryDate })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Couldn't save the entry. Try again." };

  // Keyed on the day you actually wrote, not the entry's date, so writing
  // several entries or backdating one never earns more than once a day.
  const xp = await awardXp(ctx.supabase, ctx.user.id, "journal_entry", await todayIsoLocal());

  revalidatePath("/journal");
  return { ok: true, xp, data: { id: data.id } };
}

export async function deleteJournalEntry(id: string): Promise<JournalResult> {
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "That entry doesn't exist." };
  }
  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "You're signed out. Sign in and try again." };

  const { error } = await ctx.supabase
    .from("journal_entries")
    .delete()
    .eq("id", id)
    .eq("owner_id", ctx.user.id);
  if (error) return { ok: false, error: "Couldn't delete the entry. Try again." };

  revalidatePath("/journal");
  return { ok: true };
}
