import { createClient } from "@/lib/supabase/server";
import type { CommentRow } from "./actions";

/**
 * Load all comments for a polymorphic target. Orders by created_at so the
 * client can flatten into a one-level threaded view (parent_id grouping).
 */
export async function loadComments(
  targetType: "daily_log" | "sprint",
  targetId: string
): Promise<CommentRow[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("comments")
    .select(
      "id, author_id, owner_id, target_type, target_id, parent_id, body, created_at, updated_at, author:users!comments_author_id_fkey(id, full_name, email, avatar_url)"
    )
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .order("created_at", { ascending: true });

  return (data ?? []).map((row) => ({
    ...row,
    // Supabase returns the joined relation as either an array or object
    // depending on the FK shape — normalize to a single object.
    author: Array.isArray(row.author) ? row.author[0] ?? null : row.author,
  })) as CommentRow[];
}
