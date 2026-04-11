"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type CommentTargetType = Database["public"]["Enums"]["comment_target_type"];

export type CommentRow = {
  id: string;
  author_id: string;
  owner_id: string;
  target_type: CommentTargetType;
  target_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  author: {
    id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
};

const BODY_MAX = 2000;

const createSchema = z.object({
  target_type: z.enum(["daily_log", "sprint"]),
  target_id: z.string().uuid(),
  owner_id: z.string().uuid(),
  parent_id: z.string().uuid().nullable(),
  body: z.string().trim().min(1, "Comment can't be empty").max(BODY_MAX),
  revalidate_paths: z.array(z.string()).optional(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  body: z.string().trim().min(1, "Comment can't be empty").max(BODY_MAX),
  revalidate_paths: z.array(z.string()).optional(),
});

const deleteSchema = z.object({
  id: z.string().uuid(),
  revalidate_paths: z.array(z.string()).optional(),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

async function revalidateAll(paths: string[] | undefined) {
  for (const p of paths ?? []) {
    revalidatePath(p);
  }
}

export async function createComment(
  input: z.infer<typeof createSchema>
): Promise<ActionResult & { commentId?: string }> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  // RLS enforces that the caller is either the owner or a reviewer of the
  // owner. We still pass owner_id explicitly so the polymorphic target can
  // be validated without a join.
  const { data, error } = await supabase
    .from("comments")
    .insert({
      author_id: user.id,
      owner_id: parsed.data.owner_id,
      target_type: parsed.data.target_type,
      target_id: parsed.data.target_id,
      parent_id: parsed.data.parent_id,
      body: parsed.data.body,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  await revalidateAll(parsed.data.revalidate_paths);
  return { ok: true, commentId: data.id };
}

export async function updateComment(
  input: z.infer<typeof updateSchema>
): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  // RLS "comments author all" policy restricts updates to author_id = auth.uid().
  const { error } = await supabase
    .from("comments")
    .update({ body: parsed.data.body })
    .eq("id", parsed.data.id)
    .eq("author_id", user.id);

  if (error) return { ok: false, error: error.message };

  await revalidateAll(parsed.data.revalidate_paths);
  return { ok: true };
}

export async function deleteComment(
  input: z.infer<typeof deleteSchema>
): Promise<ActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { error } = await supabase
    .from("comments")
    .delete()
    .eq("id", parsed.data.id)
    .eq("author_id", user.id);

  if (error) return { ok: false, error: error.message };

  await revalidateAll(parsed.data.revalidate_paths);
  return { ok: true };
}
