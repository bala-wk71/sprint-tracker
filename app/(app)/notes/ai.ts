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

/**
 * "Thursday, 2026-08-13" rather than the bare date. Working the weekday out
 * from an ISO date is exactly the arithmetic these models get wrong, and they
 * do it silently: given only "2026-08-13" the extractor decided it was a
 * Wednesday and filed every "by Friday" a day late.
 */
function todayLabel(): string {
  const iso = new Date().toISOString().slice(0, 10);
  const weekday = new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "UTC",
  });
  return `${weekday}, ${iso}`;
}

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

  const today = todayLabel();

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

  const today = todayLabel();

  try {
    // Unlike a chat reply, this gets written to the page as the tidy copy, so
    // a run that hits the ceiling has to fail rather than persist half a note.
    const enhanced = await generateResponse(
      getEnhancePrompt(loaded.userName, today),
      [{ role: "user", parts: [{ text: loaded.context }] }],
      { failOnTruncation: true }
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
