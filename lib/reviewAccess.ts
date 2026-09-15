import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * The owner a reviewer is looking at, or null when there is no review
 * relationship. RLS would already hide the data; this turns a guessed or
 * revoked URL into a clean 404 instead of an empty page.
 */
export async function getReviewedOwner(
  supabase: SupabaseClient<Database>,
  reviewerId: string,
  ownerId: string
): Promise<{ id: string; name: string } | null> {
  const { data } = await supabase
    .from("reviewer_relationships")
    .select("owner:users!reviewer_relationships_owner_id_fkey(full_name, email)")
    .eq("reviewer_id", reviewerId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!data) return null;

  const raw = data.owner as unknown;
  const owner = (Array.isArray(raw) ? raw[0] : raw) as
    | { full_name: string | null; email: string | null }
    | null;
  return { id: ownerId, name: owner?.full_name || owner?.email || "Owner" };
}
