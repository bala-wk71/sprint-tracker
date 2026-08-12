"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateJson, generateResponse } from "@/lib/ai/gemini";
import {
  ACTION_ITEMS_RESPONSE_SCHEMA,
  actionItemsResultSchema,
  buildPageContext,
  getEnhancePrompt,
  getExtractionPrompt,
  type ExtractedActionItem,
} from "@/lib/ai/notes";
import type { ActionResult } from "./actions";

// A transcript can be enormous. Gemini Flash would swallow it, but the free
// tier would not enjoy it — and the tail of a long meeting is where the
// commitments usually are, so keep the end rather than the start.
const MAX_TRANSCRIPT_CHARS = 80_000;

const pageIdSchema = z.string().uuid();

async function loadPageForAi(pageId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not authenticated" };

  const [{ data: page }, { data: allRows }, { data: tasks }] =
    await Promise.all([
      supabase
        .from("note_pages")
        .select(
          "id, parent_id, title, kind, body, transcript, meeting_date, attendees"
        )
        .eq("id", pageId)
        .eq("owner_id", user.id)
        .maybeSingle(),
      supabase
        .from("note_pages")
        .select("id, parent_id, title")
        .eq("owner_id", user.id),
      supabase
        .from("todo_tasks")
        .select("title")
        .eq("owner_id", user.id)
        .eq("source_page_id", pageId),
    ]);

  if (!page) return { ok: false as const, error: "Page not found" };

  const byId = new Map((allRows ?? []).map((r) => [r.id, r]));
  const path: string[] = [];
  const seen = new Set<string>([page.id]);
  let cursor = page.parent_id;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const parent = byId.get(cursor);
    if (!parent) break;
    path.unshift(parent.title);
    cursor = parent.parent_id;
  }

  const transcript = page.transcript?.slice(-MAX_TRANSCRIPT_CHARS) ?? null;

  const meta = user.user_metadata ?? {};
  const userName =
    (meta.full_name as string | undefined) ??
    (meta.name as string | undefined) ??
    user.email?.split("@")[0] ??
    "the user";

  return {
    ok: true as const,
    supabase,
    userId: user.id,
    userName,
    page,
    context: buildPageContext({
      path,
      title: page.title,
      kind: page.kind,
      meetingDate: page.meeting_date,
      attendees: page.attendees,
      body: page.body,
      transcript,
      existingItems: (tasks ?? []).map((t) => t.title),
    }),
    hasContent: Boolean(page.body.trim() || transcript?.trim()),
  };
}

export async function extractActionItems(
  pageId: string
): Promise<ActionResult<{ items: ExtractedActionItem[] }>> {
  if (!pageIdSchema.safeParse(pageId).success)
    return { ok: false, error: "Invalid page" };

  const loaded = await loadPageForAi(pageId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  if (!loaded.hasContent)
    return { ok: false, error: "Write some notes first — there is nothing to read." };

  const today = new Date().toISOString().slice(0, 10);

  try {
    const raw = await generateJson(
      getExtractionPrompt(loaded.userName, today),
      [{ role: "user", parts: [{ text: loaded.context }] }],
      ACTION_ITEMS_RESPONSE_SCHEMA
    );

    const parsed = actionItemsResultSchema.safeParse(raw);
    if (!parsed.success)
      return { ok: false, error: "The AI returned something unreadable. Try again." };

    return { ok: true, data: { items: parsed.data.items } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Extraction failed",
    };
  }
}

export async function enhanceNotes(
  pageId: string
): Promise<ActionResult<{ enhanced: string }>> {
  if (!pageIdSchema.safeParse(pageId).success)
    return { ok: false, error: "Invalid page" };

  const loaded = await loadPageForAi(pageId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  if (!loaded.hasContent)
    return { ok: false, error: "Write some notes first — there is nothing to clean up." };

  const today = new Date().toISOString().slice(0, 10);

  try {
    // A clean-up rewrites the whole note, and gemini-2.5-flash spends part of
    // the budget on thinking tokens, so the 2048 default cut long notes off
    // mid-sentence — and a truncated note must not be saved as the good copy.
    const enhanced = await generateResponse(
      getEnhancePrompt(today),
      [{ role: "user", parts: [{ text: loaded.context }] }],
      { maxOutputTokens: 8192, failOnTruncation: true }
    );

    if (!enhanced.trim())
      return { ok: false, error: "The AI returned nothing. Try again." };

    // Only enhanced_body is written — `body` stays exactly as typed.
    const { error } = await loaded.supabase
      .from("note_pages")
      .update({ enhanced_body: enhanced })
      .eq("id", pageId)
      .eq("owner_id", loaded.userId);

    if (error) return { ok: false, error: error.message };

    return { ok: true, data: { enhanced } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Enhancement failed",
    };
  }
}
