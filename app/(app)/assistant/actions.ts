"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, getUser } from "@/lib/supabase/server";
import { THREAD_TITLE_MAX, draftTitle } from "./threadTitle";

export type ThreadResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * `revalidate: false` is for the chat pane starting a thread from its first
 * message. Revalidating there re-renders the page with the new thread active
 * while the reply is still streaming, which remounts the pane (it is keyed by
 * thread id) and throws the in-flight answer away. The pane navigates to the
 * thread itself once the reply has landed.
 */
export async function createThread(
  seed?: string,
  { revalidate = true }: { revalidate?: boolean } = {}
): Promise<ThreadResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_conversations")
    .insert({
      user_id: user.id,
      title: seed ? draftTitle(seed) : "New chat",
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Couldn't start a new chat" };
  }

  if (revalidate) revalidatePath("/assistant");
  return { ok: true, id: data.id };
}

const renameSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(THREAD_TITLE_MAX),
});

export async function renameThread(
  input: z.infer<typeof renameSchema>
): Promise<ThreadResult> {
  const parsed = renameSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid title" };
  }

  const user = await getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const supabase = await createClient();
  // The user_id filter is belt-and-braces over RLS, which already scopes this.
  const { error } = await supabase
    .from("ai_conversations")
    .update({ title: parsed.data.title })
    .eq("id", parsed.data.id)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/assistant");
  return { ok: true, id: parsed.data.id };
}

export async function deleteThread(id: string): Promise<ThreadResult> {
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid conversation" };
  }

  const user = await getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const supabase = await createClient();
  // ai_messages cascades on the conversation FK, so the transcript goes too.
  const { error } = await supabase
    .from("ai_conversations")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/assistant");
  return { ok: true, id };
}
