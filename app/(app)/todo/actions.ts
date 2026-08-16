"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { awardXp } from "@/lib/gamification";

// These actions deliberately do not call revalidatePath: the page keeps an
// optimistic client-side copy of the tree (see store.tsx), and any revalidation
// in a Server Action makes the response carry a fresh RSC payload, re-rendering
// the whole page after every keystroke-level edit. /todo and /dashboard are both
// dynamic routes reading Supabase directly, so navigating to either still
// renders fresh data.

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

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

const createSectionSchema = z.object({
  name: z.string().trim().min(1).max(100),
  parentId: z.string().uuid().nullable().optional(),
});

export async function createSection(
  input: z.infer<typeof createSectionSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = createSectionSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const parentId = parsed.data.parentId ?? null;

  // count siblings to set position
  let query = ctx.supabase
    .from("todo_sections")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", ctx.user.id);

  if (parentId === null) {
    query = query.is("parent_id", null);
  } else {
    query = query.eq("parent_id", parentId);
  }

  const { count } = await query;

  const { data, error } = await ctx.supabase
    .from("todo_sections")
    .insert({
      owner_id: ctx.user.id,
      parent_id: parentId,
      name: parsed.data.name,
      position: count ?? 0,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Failed to create section" };

  return { ok: true, data: { id: data.id } };
}

const updateSectionSchema = z.object({
  sectionId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
});

export async function updateSection(
  input: z.infer<typeof updateSectionSchema>
): Promise<ActionResult> {
  const parsed = updateSectionSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { error } = await ctx.supabase
    .from("todo_sections")
    .update({ name: parsed.data.name })
    .eq("id", parsed.data.sectionId)
    .eq("owner_id", ctx.user.id);

  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

export async function deleteSection(sectionId: string): Promise<ActionResult> {
  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { error } = await ctx.supabase
    .from("todo_sections")
    .delete()
    .eq("id", sectionId)
    .eq("owner_id", ctx.user.id);

  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

const setCollapsedSchema = z.object({
  sectionId: z.string().uuid(),
  isCollapsed: z.boolean(),
});

/**
 * Persist a fold/unfold. The client already knows the target state, so this is
 * a single write — and it is fired without awaiting, since collapsing is UI
 * state and a failure costs nothing but a stale preference.
 */
export async function setSectionCollapsed(
  input: z.infer<typeof setCollapsedSchema>
): Promise<ActionResult> {
  const parsed = setCollapsedSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { error } = await ctx.supabase
    .from("todo_sections")
    .update({ is_collapsed: parsed.data.isCollapsed })
    .eq("id", parsed.data.sectionId)
    .eq("owner_id", ctx.user.id);

  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

const setArchivedSchema = z.object({
  sectionId: z.string().uuid(),
  archived: z.boolean(),
});

/**
 * Archive or restore a section. Archiving is the non-destructive alternative
 * to deleting: the section and everything under it leave the Tasks tab and
 * live in the Archived tab, tasks and completion history intact.
 *
 * A subsection can be archived on its own; archiving a parent takes its
 * subsections with it, since they are rendered inside it.
 */
export async function setSectionArchived(
  input: z.infer<typeof setArchivedSchema>
): Promise<ActionResult> {
  const parsed = setArchivedSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { error } = await ctx.supabase
    .from("todo_sections")
    .update({ archived_at: parsed.data.archived ? new Date().toISOString() : null })
    .eq("id", parsed.data.sectionId)
    .eq("owner_id", ctx.user.id);

  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

/**
 * Archive every section that has no open task left, skipping any whose parent
 * is being archived in the same pass — the parent carries its subsections, so
 * one restore later brings the whole branch back.
 */
export async function archiveClearedSections(): Promise<
  ActionResult<{ archived: number }>
> {
  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const [{ data: sections, error: sectionsError }, { data: openTasks }] =
    await Promise.all([
      ctx.supabase
        .from("todo_sections")
        .select("id, parent_id, archived_at")
        .eq("owner_id", ctx.user.id),
      ctx.supabase
        .from("todo_tasks")
        .select("section_id")
        .eq("owner_id", ctx.user.id)
        .eq("is_completed", false),
    ]);

  if (sectionsError) return { ok: false, error: sectionsError.message };

  const cleared = clearedSectionIds(sections ?? [], openTasks ?? []);
  const targets = (sections ?? [])
    .filter((s) => !s.archived_at && cleared.has(s.id))
    .filter((s) => !s.parent_id || !cleared.has(s.parent_id))
    .map((s) => s.id);

  if (targets.length === 0) return { ok: true, data: { archived: 0 } };

  const { error } = await ctx.supabase
    .from("todo_sections")
    .update({ archived_at: new Date().toISOString() })
    .in("id", targets)
    .eq("owner_id", ctx.user.id);

  if (error) return { ok: false, error: error.message };

  return { ok: true, data: { archived: targets.length } };
}

/**
 * Sections with nothing open left in them, subsections included. A parent
 * counts as busy while any of its children is.
 */
function clearedSectionIds(
  sections: { id: string; parent_id: string | null }[],
  openTasks: { section_id: string }[]
): Set<string> {
  const busy = new Set(openTasks.map((t) => t.section_id));
  const parentOf = new Map(sections.map((s) => [s.id, s.parent_id]));
  for (const id of [...busy]) {
    const parent = parentOf.get(id);
    if (parent) busy.add(parent);
  }
  return new Set(sections.map((s) => s.id).filter((id) => !busy.has(id)));
}

const reorderSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1).max(500),
});

/** Rewrite `position` for a set of sibling sections, in the given order. */
export async function reorderSections(
  input: z.infer<typeof reorderSchema>
): Promise<ActionResult> {
  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const results = await Promise.all(
    parsed.data.orderedIds.map((id, position) =>
      ctx.supabase
        .from("todo_sections")
        .update({ position })
        .eq("id", id)
        .eq("owner_id", ctx.user.id)
    )
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, error: failed.error.message };

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

const createTaskSchema = z.object({
  sectionId: z.string().uuid(),
  title: z.string().trim().min(1).max(500),
});

export async function createTask(
  input: z.infer<typeof createTaskSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = createTaskSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { count } = await ctx.supabase
    .from("todo_tasks")
    .select("*", { count: "exact", head: true })
    .eq("section_id", parsed.data.sectionId)
    .eq("owner_id", ctx.user.id);

  const { data, error } = await ctx.supabase
    .from("todo_tasks")
    .insert({
      owner_id: ctx.user.id,
      section_id: parsed.data.sectionId,
      title: parsed.data.title,
      position: count ?? 0,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Failed to create task" };

  return { ok: true, data: { id: data.id } };
}

const updateTaskSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().trim().max(2000).optional(),
});

export async function updateTask(
  input: z.infer<typeof updateTaskSchema>
): Promise<ActionResult> {
  const parsed = updateTaskSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const updates: { title?: string; description?: string | null } = {};
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.description !== undefined)
    updates.description = parsed.data.description || null;

  const { error } = await ctx.supabase
    .from("todo_tasks")
    .update(updates)
    .eq("id", parsed.data.taskId)
    .eq("owner_id", ctx.user.id);

  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

export async function deleteTask(taskId: string): Promise<ActionResult> {
  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { error } = await ctx.supabase
    .from("todo_tasks")
    .delete()
    .eq("id", taskId)
    .eq("owner_id", ctx.user.id);

  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

/** Rewrite `position` for the tasks of one section, in the given order. */
export async function reorderTasks(
  input: z.infer<typeof reorderSchema>
): Promise<ActionResult> {
  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const results = await Promise.all(
    parsed.data.orderedIds.map((id, position) =>
      ctx.supabase
        .from("todo_tasks")
        .update({ position })
        .eq("id", id)
        .eq("owner_id", ctx.user.id)
    )
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, error: failed.error.message };

  return { ok: true };
}

/** Delete every completed task the user owns. Used by the Completed tab. */
export async function clearCompletedTasks(): Promise<ActionResult<{ deleted: number }>> {
  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { data, error } = await ctx.supabase
    .from("todo_tasks")
    .delete()
    .eq("owner_id", ctx.user.id)
    .eq("is_completed", true)
    .select("id");

  if (error) return { ok: false, error: error.message };

  return { ok: true, data: { deleted: data?.length ?? 0 } };
}

const toggleTaskSchema = z.object({
  taskId: z.string().uuid(),
  isCompleted: z.boolean(),
});

export async function toggleTaskComplete(
  input: z.infer<typeof toggleTaskSchema>
): Promise<ActionResult<ArchiveEffect>> {
  const parsed = toggleTaskSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { data: task, error } = await ctx.supabase
    .from("todo_tasks")
    .update({
      is_completed: parsed.data.isCompleted,
      completed_at: parsed.data.isCompleted ? new Date().toISOString() : null,
    })
    .eq("id", parsed.data.taskId)
    .eq("owner_id", ctx.user.id)
    .select("section_id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };

  // XP once per task ever (dedupe on task id) — unchecking and re-checking
  // can't farm points, so only genuinely new completions count.
  let xp = 0;
  if (parsed.data.isCompleted) {
    xp = await awardXp(ctx.supabase, ctx.user.id, "todo_done", parsed.data.taskId);
  }

  const effect = task
    ? await settleArchiveState(ctx, task.section_id, parsed.data.isCompleted)
    : EMPTY_ARCHIVE_EFFECT;

  return { ok: true, xp, data: effect };
}

export type ArchiveEffect = {
  /** Sections the server just archived on its own. */
  archivedSectionIds: string[];
  /** Sections pulled back out of the archive because work reopened in them. */
  restoredSectionIds: string[];
};

const EMPTY_ARCHIVE_EFFECT: ArchiveEffect = {
  archivedSectionIds: [],
  restoredSectionIds: [],
};

/**
 * Keep a note-created section's archived state in step with its tasks.
 *
 * Ticking off the last open item retires the section (this is the automatic
 * half of archiving, and only note sections opt in — hand-made sections are
 * long-lived lists the user curates). Reopening an item in an archived section
 * always brings it back, note-created or not, since an archived section with
 * live work in it would simply be lost.
 */
async function settleArchiveState(
  ctx: NonNullable<Awaited<ReturnType<typeof getUserOrFail>>>,
  sectionId: string,
  completed: boolean
): Promise<ArchiveEffect> {
  const { data: section } = await ctx.supabase
    .from("todo_sections")
    .select("id, parent_id, source_page_id, archived_at")
    .eq("id", sectionId)
    .eq("owner_id", ctx.user.id)
    .maybeSingle();

  if (!section) return EMPTY_ARCHIVE_EFFECT;

  if (!completed) {
    // Restore the section and, if it sits inside one, its parent.
    const ids = [section.id, section.parent_id].filter(
      (id): id is string => Boolean(id)
    );
    const { data: restored } = await ctx.supabase
      .from("todo_sections")
      .update({ archived_at: null })
      .in("id", ids)
      .eq("owner_id", ctx.user.id)
      .not("archived_at", "is", null)
      .select("id");

    return {
      ...EMPTY_ARCHIVE_EFFECT,
      restoredSectionIds: (restored ?? []).map((r) => r.id),
    };
  }

  if (!section.source_page_id || section.archived_at) return EMPTY_ARCHIVE_EFFECT;

  const { data: prefs } = await ctx.supabase
    .from("users")
    .select("todo_auto_archive")
    .eq("id", ctx.user.id)
    .maybeSingle();

  if (prefs && prefs.todo_auto_archive === false) return EMPTY_ARCHIVE_EFFECT;

  // The branch is only done when the section and its siblings under the same
  // parent have nothing open left, so walk the parent's whole subtree.
  const rootId = section.parent_id ?? section.id;
  const { data: branch } = await ctx.supabase
    .from("todo_sections")
    .select("id, parent_id, source_page_id")
    .eq("owner_id", ctx.user.id)
    .or(`id.eq.${rootId},parent_id.eq.${rootId}`);

  const branchIds = (branch ?? []).map((s) => s.id);
  if (branchIds.length === 0) return EMPTY_ARCHIVE_EFFECT;

  const { data: openTasks } = await ctx.supabase
    .from("todo_tasks")
    .select("section_id")
    .eq("owner_id", ctx.user.id)
    .eq("is_completed", false)
    .in("section_id", branchIds);

  const cleared = clearedSectionIds(branch ?? [], openTasks ?? []);

  // Prefer archiving the root so one restore brings the branch back; fall back
  // to the subsection when the rest of the branch is still live.
  const target = [(branch ?? []).find((s) => s.id === rootId), section].find(
    (s) => s && cleared.has(s.id) && s.source_page_id
  );

  if (!target) return EMPTY_ARCHIVE_EFFECT;

  const { error: archiveError } = await ctx.supabase
    .from("todo_sections")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", target.id)
    .eq("owner_id", ctx.user.id);

  if (archiveError) return EMPTY_ARCHIVE_EFFECT;

  return { ...EMPTY_ARCHIVE_EFFECT, archivedSectionIds: [target.id] };
}
