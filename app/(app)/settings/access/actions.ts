"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { MAX_INVITES } from "@/lib/constants";

export type ActionResult = { ok: true } | { ok: false; error: string };

const createInviteSchema = z.object({
  invitee_email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address"),
  invite_type: z.enum(["reviewer", "owner"]),
});

export type CreateInviteInput = z.infer<typeof createInviteSchema>;

const INVITE_TTL_DAYS = 14;

function generateToken() {
  return randomBytes(24).toString("base64url");
}

async function getUserOrFail() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

export async function createInvite(input: CreateInviteInput): Promise<ActionResult> {
  const parsed = createInviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  // Don't let a user invite themselves.
  if (ctx.user.email && parsed.data.invitee_email === ctx.user.email.toLowerCase()) {
    return { ok: false, error: "You can't invite yourself." };
  }

  // Enforce the 5-pending-invite cap.
  const { count, error: countError } = await ctx.supabase
    .from("invites")
    .select("id", { count: "exact", head: true })
    .eq("inviter_id", ctx.user.id)
    .eq("status", "pending");

  if (countError) return { ok: false, error: countError.message };
  if ((count ?? 0) >= MAX_INVITES) {
    return {
      ok: false,
      error: `You already have ${MAX_INVITES} pending invites. Revoke one to send another.`,
    };
  }

  // Block duplicate pending invites for the same email + type.
  const { data: existing } = await ctx.supabase
    .from("invites")
    .select("id")
    .eq("inviter_id", ctx.user.id)
    .eq("invitee_email", parsed.data.invitee_email)
    .eq("invite_type", parsed.data.invite_type)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) {
    return {
      ok: false,
      error: "An invite is already pending for that email and role.",
    };
  }

  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITE_TTL_DAYS);

  const { error } = await ctx.supabase.from("invites").insert({
    inviter_id: ctx.user.id,
    invitee_email: parsed.data.invitee_email,
    invite_type: parsed.data.invite_type,
    token,
    expires_at: expiresAt.toISOString(),
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings/access");
  return { ok: true };
}

export async function revokeInvite(inviteId: string): Promise<ActionResult> {
  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { error } = await ctx.supabase
    .from("invites")
    .update({ status: "revoked" })
    .eq("id", inviteId)
    .eq("inviter_id", ctx.user.id)
    .eq("status", "pending");

  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings/access");
  return { ok: true };
}

export async function removeReviewer(relationshipId: string): Promise<ActionResult> {
  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  // RLS already requires owner_id = auth.uid() for delete, but be explicit.
  const { error } = await ctx.supabase
    .from("reviewer_relationships")
    .delete()
    .eq("id", relationshipId)
    .eq("owner_id", ctx.user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings/access");
  return { ok: true };
}
