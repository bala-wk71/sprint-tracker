"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { awardXp, awardTrackedXp } from "@/lib/gamification";
import { todayIsoLocal } from "@/lib/dates";
import { CHECKLIST_ITEM_IDS, isComplete, type Ticks } from "@/lib/craft/checklist";
import { topicBySlug } from "@/lib/craft/curriculum";

export type ActionResult<T = undefined> =
  | ({ ok: true; xp?: number } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

async function getUserOrFail() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

/** jsonb comes back as Json; narrow it to the tick bag without trusting it. */
function asTicks(value: unknown): Ticks {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Ticks = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (val === true) out[key] = true;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rigor runs — the per-task checklist
// ---------------------------------------------------------------------------

const taskIdSchema = z.object({ taskId: z.string().uuid() });

/** Attach a checklist to a task. Idempotent: re-attaching returns the existing run. */
export async function attachRigor(
  input: z.infer<typeof taskIdSchema>
): Promise<ActionResult<{ ticks: Ticks }>> {
  const parsed = taskIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid task" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  // upsert rather than insert: the unique constraint on task_id already makes
  // a double-click harmless, and this way the second click is a no-op instead
  // of an error the UI would have to explain.
  const { data, error } = await ctx.supabase
    .from("craft_runs")
    .upsert(
      { owner_id: ctx.user.id, task_id: parsed.data.taskId },
      { onConflict: "task_id", ignoreDuplicates: false }
    )
    .select("ticks")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { ticks: asTicks(data.ticks) } };
}

export async function detachRigor(
  input: z.infer<typeof taskIdSchema>
): Promise<ActionResult> {
  const parsed = taskIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid task" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { error } = await ctx.supabase
    .from("craft_runs")
    .delete()
    .eq("task_id", parsed.data.taskId)
    .eq("owner_id", ctx.user.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

const tickSchema = z.object({
  taskId: z.string().uuid(),
  itemId: z.string().refine((id) => CHECKLIST_ITEM_IDS.includes(id), "Unknown item"),
  value: z.boolean(),
});

/**
 * Tick or untick one box.
 *
 * Goes through the craft_set_tick function rather than reading the bag,
 * changing it and writing it back: two open tabs doing that would lose a tick.
 * One statement, no race.
 */
export async function setTick(
  input: z.infer<typeof tickSchema>
): Promise<ActionResult<{ ticks: Ticks }>> {
  const parsed = tickSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { data, error } = await ctx.supabase.rpc("craft_set_tick", {
    p_task_id: parsed.data.taskId,
    p_item: parsed.data.itemId,
    p_value: parsed.data.value,
  });

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "That checklist is already closed." };
  return { ok: true, data: { ticks: asTicks(data.ticks) } };
}

const completeSchema = z.object({
  taskId: z.string().uuid(),
  lesson: z.string().trim().max(4000).optional(),
});

/**
 * Close a run and complete the task behind it, in that order.
 *
 * The full-checklist requirement is re-checked here against the stored ticks,
 * not the ones the browser sent — the gate is the point of the feature, and a
 * gate enforced only in the UI is decoration.
 */
export async function completeRigor(
  input: z.infer<typeof completeSchema>
): Promise<ActionResult<{ completedAt: string }>> {
  const parsed = completeSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { data: run, error: readError } = await ctx.supabase
    .from("craft_runs")
    .select("id, ticks, completed_at")
    .eq("task_id", parsed.data.taskId)
    .eq("owner_id", ctx.user.id)
    .maybeSingle();

  if (readError) return { ok: false, error: readError.message };
  if (!run) return { ok: false, error: "No checklist on that task." };
  if (run.completed_at) return { ok: false, error: "That checklist is already closed." };
  if (!isComplete(asTicks(run.ticks)))
    return { ok: false, error: "Every box has to be ticked first." };

  const completedAt = new Date().toISOString();
  const lesson = parsed.data.lesson?.trim();

  const { error: runError } = await ctx.supabase
    .from("craft_runs")
    .update({ completed_at: completedAt, lesson: lesson || null })
    .eq("id", run.id)
    .eq("owner_id", ctx.user.id);

  if (runError) return { ok: false, error: runError.message };

  // The task and the run are two writes with no transaction between them. The
  // order is deliberate: a closed run with an open task is a visible, fixable
  // state, where the reverse would silently drop the checklist.
  const { error: taskError } = await ctx.supabase
    .from("todo_tasks")
    .update({ is_completed: true, completed_at: completedAt })
    .eq("id", parsed.data.taskId)
    .eq("owner_id", ctx.user.id);

  if (taskError) return { ok: false, error: taskError.message };

  const today = await todayIsoLocal();
  const xp = await awardTrackedXp(
    ctx.supabase,
    ctx.user.id,
    "rigor_run",
    run.id,
    today
  );

  revalidatePath("/craft");
  return { ok: true, data: { completedAt }, xp };
}

/** Reopen a closed run, e.g. when review sends the work back. */
export async function reopenRigor(
  input: z.infer<typeof taskIdSchema>
): Promise<ActionResult> {
  const parsed = taskIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid task" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { error } = await ctx.supabase
    .from("craft_runs")
    .update({ completed_at: null })
    .eq("task_id", parsed.data.taskId)
    .eq("owner_id", ctx.user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/craft");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Foundations — the read-once curriculum
// ---------------------------------------------------------------------------

const readingSchema = z.object({
  slug: z.string().refine((s) => Boolean(topicBySlug(s)), "Unknown topic"),
  status: z.enum(["reading", "read"]),
});

export async function setTopicStatus(
  input: z.infer<typeof readingSchema>
): Promise<ActionResult> {
  const parsed = readingSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { slug, status } = parsed.data;

  const { error } = await ctx.supabase.from("craft_reading").upsert(
    {
      owner_id: ctx.user.id,
      topic_slug: slug,
      status,
      // Keep the first read_at rather than overwriting on a re-read: when you
      // first understood something is the interesting date.
      ...(status === "read" ? { read_at: new Date().toISOString() } : {}),
    },
    { onConflict: "owner_id,topic_slug" }
  );

  if (error) return { ok: false, error: error.message };

  // Once per topic, ever — the slug is the dedupe key, so re-reading pays
  // nothing and marking read/unread/read cannot be farmed.
  const xp =
    status === "read"
      ? await awardXp(ctx.supabase, ctx.user.id, "foundation_read", slug)
      : 0;

  revalidatePath("/craft");
  return { ok: true, xp };
}

const notesSchema = z.object({
  slug: z.string().refine((s) => Boolean(topicBySlug(s)), "Unknown topic"),
  notes: z.string().max(8000),
});

export async function saveTopicNotes(
  input: z.infer<typeof notesSchema>
): Promise<ActionResult> {
  const parsed = notesSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const notes = parsed.data.notes.trim();

  const { data: existing } = await ctx.supabase
    .from("craft_reading")
    .select("status")
    .eq("owner_id", ctx.user.id)
    .eq("topic_slug", parsed.data.slug)
    .maybeSingle();

  const { error } = await ctx.supabase.from("craft_reading").upsert(
    {
      owner_id: ctx.user.id,
      topic_slug: parsed.data.slug,
      notes: notes || null,
      // Writing a note on an untouched topic means you are reading it.
      status: existing?.status ?? "reading",
    },
    { onConflict: "owner_id,topic_slug" }
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
