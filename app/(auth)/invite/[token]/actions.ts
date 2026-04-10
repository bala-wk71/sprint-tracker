"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type AcceptResult =
  | { ok: true; ownerId: string; reviewerId: string }
  | { ok: false; error: string };

export async function acceptInvite(token: string): Promise<AcceptResult> {
  if (!token || typeof token !== "string") {
    return { ok: false, error: "Missing invite token" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  // The accept_invite RPC was added in migration 011 and isn't yet in the
  // generated Database types. Cast the rpc call so we can call it without
  // regenerating types until the next pass of `supabase gen types`.
  type AcceptInviteRow = {
    relationship_id: string;
    owner_id: string;
    reviewer_id: string;
  };
  const { data, error } = await (
    supabase.rpc as unknown as (
      fn: "accept_invite",
      args: { invite_token: string }
    ) => Promise<{ data: AcceptInviteRow[] | null; error: { message: string } | null }>
  )("accept_invite", { invite_token: token });

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.owner_id || !row.reviewer_id) {
    return { ok: false, error: "Invite acceptance returned no relationship" };
  }

  revalidatePath("/settings/access");
  revalidatePath("/review");
  return { ok: true, ownerId: row.owner_id, reviewerId: row.reviewer_id };
}
