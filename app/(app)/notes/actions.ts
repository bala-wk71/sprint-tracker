"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

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

const createPageSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  parentId: z.string().uuid().nullable().optional(),
  kind: z.enum(["page", "meeting"]).optional(),
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

  let siblings = ctx.supabase
    .from("note_pages")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", ctx.user.id);
  siblings =
    parentId === null
      ? siblings.is("parent_id", null)
      : siblings.eq("parent_id", parentId);
  const { count } = await siblings;

  const kind = parsed.data.kind ?? "page";

  const { data, error } = await ctx.supabase
    .from("note_pages")
    .insert({
      owner_id: ctx.user.id,
      parent_id: parentId,
      title: parsed.data.title ?? (kind === "meeting" ? "New meeting" : "Untitled"),
      kind,
      meeting_date:
        kind === "meeting" ? new Date().toISOString().slice(0, 10) : null,
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

  if (parentId) {
    const { data: rows, error: readError } = await ctx.supabase
      .from("note_pages")
      .select("id, parent_id")
      .eq("owner_id", ctx.user.id);

    if (readError) return { ok: false, error: readError.message };

    const parentById = new Map((rows ?? []).map((r) => [r.id, r.parent_id]));
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
// The todo tree is two levels deep and the page tree is not, so a page's items
// are filed as: root ancestor page -> top-level section, the page itself ->
// subsection. `todo_sections.source_page_id` keeps that lookup idempotent.
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
    .select("id, parent_id, title")
    .eq("owner_id", ownerId);

  if (pagesError) return { ok: false, error: pagesError.message };

  const byId = new Map((pages ?? []).map((p) => [p.id, p]));
  const page = byId.get(pageId);
  if (!page) return { ok: false, error: "Page not found" };

  let root = page;
  const seen = new Set<string>([page.id]);
  while (root.parent_id && !seen.has(root.parent_id)) {
    const parent = byId.get(root.parent_id);
    if (!parent) break;
    seen.add(parent.id);
    root = parent;
  }

  const findOrCreateSection = async (
    sourcePageId: string,
    name: string,
    parentSectionId: string | null
  ): Promise<{ id: string } | { error: string }> => {
    const { data: existing } = await ctx.supabase
      .from("todo_sections")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("source_page_id", sourcePageId)
      .maybeSingle();

    if (existing) return { id: existing.id };

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
