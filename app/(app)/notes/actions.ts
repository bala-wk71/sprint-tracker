"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { formatMeetingDate } from "./format";
import { canNest, descendantIds, nestingError, topicOf } from "./tree";
import { toNoteKind, type NoteKind } from "./types";

// `updatePage` deliberately skips revalidatePath: the editor autosaves while
// you type, and revalidating there would re-render the whole route on every
// keystroke.
//
// The actions that change the shape of the tree do revalidate, because the
// tree is rendered by the notes *layout*. Pairing a client-side
// router.refresh() with the navigation these also need fails three different
// ways, all of which this feature has shipped at some point:
//
//   push() then refresh()  — the refresh refetches the route being torn down
//     while the push is in flight and the transition never settles, so the
//     page is created or deleted, the URL never changes, and every control
//     driven by isPending stays disabled forever.
//   refresh() then push()  — settles, but refreshes the route being left. The
//     layout is not refetched when moving between sibling pages, so the
//     destination renders a stale sidebar: a new page missing from it, a
//     deleted one lingering as a ghost row.
//   push() then a deferred refresh — cancels the navigation.
//
// Revalidating the layout path here sidesteps all of it, and leaves the
// callers with an ordinary router.push().
const NOTES_PATH = "/notes";
function revalidateTree() {
  revalidatePath(NOTES_PATH, "layout");
}

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

async function getUserOrFail() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The kind of `parentId`, or null for the top level. */
async function parentKind(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ownerId: string,
  parentId: string | null
): Promise<NoteKind | null | { error: string }> {
  if (!parentId) return null;
  const { data } = await supabase
    .from("note_pages")
    .select("kind")
    .eq("id", parentId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!data) return { error: "That page no longer exists" };
  return toNoteKind(data.kind);
}

const createPageSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  parentId: z.string().uuid().nullable().optional(),
  kind: z.enum(["page", "meeting", "series"]).optional(),
  /** Occurrences only: the day the meeting happened. Defaults to today. */
  meetingDate: z.string().date().optional(),
});

export async function createPage(
  input: z.infer<typeof createPageSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = createPageSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const parentId = parsed.data.parentId ?? null;
  const kind = parsed.data.kind ?? "page";

  const parent = await parentKind(ctx.supabase, ctx.user.id, parentId);
  if (parent && typeof parent === "object")
    return { ok: false, error: parent.error };
  if (!canNest(kind, parent))
    return { ok: false, error: nestingError(kind, parent!) };

  let siblings = ctx.supabase
    .from("note_pages")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", ctx.user.id);
  siblings =
    parentId === null
      ? siblings.is("parent_id", null)
      : siblings.eq("parent_id", parentId);
  const { count } = await siblings;

  // An occurrence names itself after the day it happened — the series above it
  // already says which meeting this is, and typing "Daily Scrum" again every
  // morning is the kind of chore that stops a note from being taken at all.
  const isOccurrence = kind === "meeting" && parent === "series";
  const meetingDate =
    kind === "meeting" ? (parsed.data.meetingDate ?? todayIso()) : null;

  const defaultTitle = isOccurrence
    ? (formatMeetingDate(meetingDate) ?? "New meeting")
    : kind === "meeting"
      ? "New meeting"
      : kind === "series"
        ? "New series"
        : "Untitled";

  const { data, error } = await ctx.supabase
    .from("note_pages")
    .insert({
      owner_id: ctx.user.id,
      parent_id: parentId,
      title: parsed.data.title ?? defaultTitle,
      kind,
      meeting_date: meetingDate,
      position: count ?? 0,
    })
    .select("id")
    .single();

  if (error || !data)
    return { ok: false, error: error?.message ?? "Failed to create page" };

  revalidateTree();
  return { ok: true, data: { id: data.id } };
}

const updatePageSchema = z.object({
  pageId: z.string().uuid(),
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().max(200_000).optional(),
  transcript: z.string().max(500_000).optional(),
  meetingDate: z.string().date().nullable().optional(),
  attendees: z.string().trim().max(1000).optional(),
});

export async function updatePage(
  input: z.infer<typeof updatePageSchema>
): Promise<ActionResult> {
  const parsed = updatePageSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { pageId, title, body, transcript, meetingDate, attendees } = parsed.data;
  const updates: {
    title?: string;
    body?: string;
    transcript?: string | null;
    meeting_date?: string | null;
    attendees?: string | null;
  } = {};
  if (title !== undefined) updates.title = title;
  if (body !== undefined) updates.body = body;
  if (transcript !== undefined) updates.transcript = transcript || null;
  if (meetingDate !== undefined) updates.meeting_date = meetingDate;
  if (attendees !== undefined) updates.attendees = attendees || null;

  if (Object.keys(updates).length === 0) return { ok: true };

  const { error } = await ctx.supabase
    .from("note_pages")
    .update(updates)
    .eq("id", pageId)
    .eq("owner_id", ctx.user.id);

  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

const movePageSchema = z.object({
  pageId: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
});

/**
 * Reparent a page. Rejects moves into the page's own subtree — Postgres has no
 * constraint for that, and letting one through would orphan the branch from
 * every root and make it unreachable in the sidebar.
 */
export async function movePage(
  input: z.infer<typeof movePageSchema>
): Promise<ActionResult> {
  const parsed = movePageSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { pageId, parentId } = parsed.data;
  if (pageId === parentId)
    return { ok: false, error: "A page cannot be nested inside itself" };

  const { data: rows, error: readError } = await ctx.supabase
    .from("note_pages")
    .select("id, parent_id, kind")
    .eq("owner_id", ctx.user.id);

  if (readError) return { ok: false, error: readError.message };

  const all = (rows ?? []).map((r) => ({ ...r, kind: toNoteKind(r.kind) }));
  const self = all.find((r) => r.id === pageId);
  if (!self) return { ok: false, error: "Page not found" };

  const target = parentId ? all.find((r) => r.id === parentId) : null;
  if (parentId && !target) return { ok: false, error: "That page no longer exists" };

  if (!canNest(self.kind, target?.kind ?? null))
    return { ok: false, error: nestingError(self.kind, target!.kind) };

  if (parentId) {
    const parentById = new Map(all.map((r) => [r.id, r.parent_id]));
    let cursor: string | null = parentId;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
      if (cursor === pageId)
        return { ok: false, error: "A page cannot be nested inside itself" };
      seen.add(cursor);
      cursor = parentById.get(cursor) ?? null;
    }
  }

  const { count } = await (parentId === null
    ? ctx.supabase
        .from("note_pages")
        .select("*", { count: "exact", head: true })
        .eq("owner_id", ctx.user.id)
        .is("parent_id", null)
    : ctx.supabase
        .from("note_pages")
        .select("*", { count: "exact", head: true })
        .eq("owner_id", ctx.user.id)
        .eq("parent_id", parentId));

  const { error } = await ctx.supabase
    .from("note_pages")
    .update({ parent_id: parentId, position: count ?? 0 })
    .eq("id", pageId)
    .eq("owner_id", ctx.user.id);

  if (error) return { ok: false, error: error.message };

  revalidateTree();
  return { ok: true };
}

const reorderSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1).max(500),
});

/** Rewrite `position` for a set of sibling pages, in the given order. */
export async function reorderPages(
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
        .from("note_pages")
        .update({ position })
        .eq("id", id)
        .eq("owner_id", ctx.user.id)
    )
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, error: failed.error.message };

  revalidateTree();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Archiving
//
// Deleting a finished meeting takes its notes with it, so nobody does it, and
// a daily meeting buries the sidebar within a month. Archiving retires the
// page instead: out of the tree, into /notes/archive, restorable whole.
//
// A branch is stamped all the way down. Leaving a live child under an archived
// parent would not hide it — buildTree finds no parent for it and promotes it
// to a root — so the page would reappear at the top of the sidebar, detached
// from the meeting it belonged to.
// ---------------------------------------------------------------------------

async function subtreeIds(
  ctx: NonNullable<Awaited<ReturnType<typeof getUserOrFail>>>,
  pageId: string
): Promise<string[] | { error: string }> {
  const { data, error } = await ctx.supabase
    .from("note_pages")
    .select("id, parent_id, kind")
    .eq("owner_id", ctx.user.id);
  if (error) return { error: error.message };

  const rows = (data ?? []).map((r) => ({ ...r, kind: toNoteKind(r.kind) }));
  if (!rows.some((r) => r.id === pageId)) return { error: "Page not found" };
  return [...descendantIds(rows, pageId)];
}

/**
 * Archive or restore the todo sections these pages created.
 *
 * A section only retires once nothing on it is open: a page can be finished
 * with you while a commitment made in it is not, and silently sweeping that
 * off the board is exactly the failure archiving is supposed to prevent. The
 * count of what stayed behind comes back so the UI can say so.
 */
async function syncLinkedSections(
  ctx: NonNullable<Awaited<ReturnType<typeof getUserOrFail>>>,
  pageIds: string[],
  archived: boolean
): Promise<{ openLeft: number }> {
  if (pageIds.length === 0) return { openLeft: 0 };

  const ownerId = ctx.user.id;
  const { data: linked } = await ctx.supabase
    .from("todo_sections")
    .select("id")
    .eq("owner_id", ownerId)
    .in("source_page_id", pageIds);

  const candidates = (linked ?? []).map((s) => s.id);
  if (candidates.length === 0) return { openLeft: 0 };

  if (!archived) {
    await ctx.supabase
      .from("todo_sections")
      .update({ archived_at: null })
      .in("id", candidates)
      .eq("owner_id", ownerId);
    return { openLeft: 0 };
  }

  const [{ data: sections }, { data: openTasks }] = await Promise.all([
    ctx.supabase
      .from("todo_sections")
      .select("id, parent_id")
      .eq("owner_id", ownerId),
    ctx.supabase
      .from("todo_tasks")
      .select("section_id")
      .eq("owner_id", ownerId)
      .eq("is_completed", false),
  ]);

  // An open task keeps its own section busy and every section above it, so a
  // parent is never archived out from under a child that still has work.
  const openBySection = new Map<string, number>();
  for (const task of openTasks ?? [])
    openBySection.set(
      task.section_id,
      (openBySection.get(task.section_id) ?? 0) + 1
    );

  const parentOf = new Map((sections ?? []).map((s) => [s.id, s.parent_id]));
  const busy = new Map<string, number>();
  for (const [id, count] of openBySection) {
    let cursor: string | null = id;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      busy.set(cursor, (busy.get(cursor) ?? 0) + count);
      cursor = parentOf.get(cursor) ?? null;
    }
  }

  const retire = candidates.filter((id) => !busy.has(id));
  const openLeft = candidates.reduce((sum, id) => sum + (busy.get(id) ?? 0), 0);

  if (retire.length > 0) {
    await ctx.supabase
      .from("todo_sections")
      .update({ archived_at: new Date().toISOString() })
      .in("id", retire)
      .eq("owner_id", ownerId);
  }

  return { openLeft };
}

const setArchivedSchema = z.object({
  pageId: z.string().uuid(),
  archived: z.boolean(),
});

export async function setPageArchived(
  input: z.infer<typeof setArchivedSchema>
): Promise<ActionResult<{ pages: number; openItemsLeft: number }>> {
  const parsed = setArchivedSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const ids = await subtreeIds(ctx, parsed.data.pageId);
  if (!Array.isArray(ids)) return { ok: false, error: ids.error };

  const { error } = await ctx.supabase
    .from("note_pages")
    .update({
      archived_at: parsed.data.archived ? new Date().toISOString() : null,
    })
    .in("id", ids)
    .eq("owner_id", ctx.user.id);

  if (error) return { ok: false, error: error.message };

  const { openLeft } = await syncLinkedSections(ctx, ids, parsed.data.archived);

  revalidateTree();
  return { ok: true, data: { pages: ids.length, openItemsLeft: openLeft } };
}

const tidySchema = z.object({
  seriesId: z.string().uuid(),
  olderThanDays: z.union([z.literal(30), z.literal(60), z.literal(90)]),
});

/**
 * Retire the back catalogue of a series in one go.
 *
 * An occurrence with an open action item is left alone however old it is —
 * age is a reason to stop looking at a meeting, never a reason to lose track
 * of what you promised in it.
 */
export async function archiveOldOccurrences(
  input: z.infer<typeof tidySchema>
): Promise<ActionResult<{ archived: number; keptOpen: number; before: string }>> {
  const parsed = tidySchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { seriesId, olderThanDays } = parsed.data;
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - olderThanDays);
  const before = cutoff.toISOString().slice(0, 10);

  const { data: occurrences, error } = await ctx.supabase
    .from("note_pages")
    .select("id, meeting_date")
    .eq("owner_id", ctx.user.id)
    .eq("parent_id", seriesId)
    .is("archived_at", null)
    .not("meeting_date", "is", null)
    .lt("meeting_date", before);

  if (error) return { ok: false, error: error.message };

  const ids = (occurrences ?? []).map((o) => o.id);
  if (ids.length === 0)
    return { ok: true, data: { archived: 0, keptOpen: 0, before } };

  const { data: openItems } = await ctx.supabase
    .from("todo_tasks")
    .select("source_page_id")
    .eq("owner_id", ctx.user.id)
    .eq("is_completed", false)
    .in("source_page_id", ids);

  const blocked = new Set((openItems ?? []).map((t) => t.source_page_id));
  const retire = ids.filter((id) => !blocked.has(id));

  if (retire.length > 0) {
    const { error: writeError } = await ctx.supabase
      .from("note_pages")
      .update({ archived_at: new Date().toISOString() })
      .in("id", retire)
      .eq("owner_id", ctx.user.id);
    if (writeError) return { ok: false, error: writeError.message };

    await syncLinkedSections(ctx, retire, true);
  }

  revalidateTree();
  return {
    ok: true,
    data: { archived: retire.length, keptOpen: blocked.size, before },
  };
}

/** Delete a page and, via the FK cascade, everything nested beneath it. */
export async function deletePage(pageId: string): Promise<ActionResult> {
  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { error } = await ctx.supabase
    .from("note_pages")
    .delete()
    .eq("id", pageId)
    .eq("owner_id", ctx.user.id);

  if (error) return { ok: false, error: error.message };

  revalidateTree();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Action items
//
// An action item is an ordinary todo_tasks row, so it keeps XP, the Completed
// tab, search and reordering. What makes it a note item is `source_page_id`.
// The todo tree is two levels deep, so a page's items are filed as:
// topic page -> top-level section, the page itself -> subsection. The topic is
// the series an occurrence belongs to, falling back to the outermost ancestor
// for a standalone meeting or a document page.
// `todo_sections.source_page_id` keeps that lookup idempotent.
// ---------------------------------------------------------------------------

const actionItemInputSchema = z.object({
  title: z.string().trim().min(1).max(500),
  dueDate: z.string().date().nullable().optional(),
});

const addActionItemsSchema = z.object({
  pageId: z.string().uuid(),
  items: z.array(actionItemInputSchema).min(1).max(50),
});

export async function addActionItems(
  input: z.infer<typeof addActionItemsSchema>
): Promise<ActionResult<{ added: number; skipped: number }>> {
  const parsed = addActionItemsSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { pageId, items } = parsed.data;
  const ownerId = ctx.user.id;

  const { data: pages, error: pagesError } = await ctx.supabase
    .from("note_pages")
    .select("id, parent_id, title, kind")
    .eq("owner_id", ownerId);

  if (pagesError) return { ok: false, error: pagesError.message };

  const pageRows = (pages ?? []).map((p) => ({ ...p, kind: toNoteKind(p.kind) }));
  const page = pageRows.find((p) => p.id === pageId);
  if (!page) return { ok: false, error: "Page not found" };

  // The topic is the series when there is one, so the board reads
  // "Daily Scrum › Aug 18" no matter which project folder the series is filed
  // under. Without a series it stays the outermost page, as before.
  const root = topicOf(pageRows, pageId) ?? page;

  const findOrCreateSection = async (
    sourcePageId: string,
    name: string,
    parentSectionId: string | null
  ): Promise<{ id: string } | { error: string }> => {
    const { data: existing } = await ctx.supabase
      .from("todo_sections")
      .select("id, archived_at")
      .eq("owner_id", ownerId)
      .eq("source_page_id", sourcePageId)
      .maybeSingle();

    if (existing) {
      // Filing new items into a section that was archived once its last item
      // was ticked off brings it back — otherwise the items would land
      // somewhere the user can't see.
      if (existing.archived_at) {
        await ctx.supabase
          .from("todo_sections")
          .update({ archived_at: null })
          .eq("id", existing.id)
          .eq("owner_id", ownerId);
      }
      return { id: existing.id };
    }

    let siblings = ctx.supabase
      .from("todo_sections")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", ownerId);
    siblings =
      parentSectionId === null
        ? siblings.is("parent_id", null)
        : siblings.eq("parent_id", parentSectionId);
    const { count } = await siblings;

    const { data: created, error } = await ctx.supabase
      .from("todo_sections")
      .insert({
        owner_id: ownerId,
        parent_id: parentSectionId,
        name,
        position: count ?? 0,
        source_page_id: sourcePageId,
      })
      .select("id")
      .single();

    if (error || !created)
      return { error: error?.message ?? "Failed to create section" };
    return { id: created.id };
  };

  const rootSection = await findOrCreateSection(root.id, root.title, null);
  if ("error" in rootSection) return { ok: false, error: rootSection.error };

  let target = rootSection;
  if (page.id !== root.id) {
    const sub = await findOrCreateSection(page.id, page.title, rootSection.id);
    if ("error" in sub) return { ok: false, error: sub.error };
    target = sub;
  }

  // Second dedupe guard: the AI is told what it already proposed, but a manual
  // add or a re-run should still never produce the same item twice.
  const { data: existingTasks } = await ctx.supabase
    .from("todo_tasks")
    .select("title")
    .eq("owner_id", ownerId)
    .eq("source_page_id", pageId);

  const taken = new Set(
    (existingTasks ?? []).map((t) => t.title.trim().toLowerCase())
  );

  const { count: taskCount } = await ctx.supabase
    .from("todo_tasks")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .eq("section_id", target.id);

  const rows: {
    owner_id: string;
    section_id: string;
    title: string;
    due_date: string | null;
    source_page_id: string;
    position: number;
  }[] = [];

  let position = taskCount ?? 0;
  for (const item of items) {
    const key = item.title.toLowerCase();
    if (taken.has(key)) continue;
    taken.add(key);
    rows.push({
      owner_id: ownerId,
      section_id: target.id,
      title: item.title,
      due_date: item.dueDate ?? null,
      source_page_id: pageId,
      position: position++,
    });
  }

  const skipped = items.length - rows.length;
  if (rows.length === 0) return { ok: true, data: { added: 0, skipped } };

  const { error } = await ctx.supabase.from("todo_tasks").insert(rows);
  if (error) return { ok: false, error: error.message };

  return { ok: true, data: { added: rows.length, skipped } };
}
