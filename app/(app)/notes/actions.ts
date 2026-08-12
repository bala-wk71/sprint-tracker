"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Like the todo actions, these deliberately skip revalidatePath: the editor
// autosaves while you type and the sidebar keeps a local copy of the tree, so
// revalidating here would re-render the whole route on every keystroke. The
// callers that change tree *shape* (create, move, delete, rename) call
// router.refresh() themselves, which is cheap because it happens once.

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

  return { ok: true };
}
