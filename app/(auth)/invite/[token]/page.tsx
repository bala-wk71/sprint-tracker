import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AcceptInviteButton } from "./AcceptInviteButton";

export default async function InviteAcceptancePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Bounce through Google OAuth, then come back to this same page.
    redirect(`/login?next=/invite/${encodeURIComponent(token)}`);
  }

  // RLS: invitee can SELECT only invites where invitee_email matches their
  // own email. So a non-match returns nothing — same shape as "not found".
  const { data: invite } = await supabase
    .from("invites")
    .select("id, invitee_email, invite_type, status, expires_at, inviter_id")
    .eq("token", token)
    .maybeSingle();

  // Inviter profile (RLS allows reading users that review you OR that you
  // review; an invitee not yet related to the inviter can't see them. So
  // fall back to a generic name if missing.)
  let inviterName: string | null = null;
  if (invite) {
    const { data: inviter } = await supabase
      .from("users")
      .select("full_name, email")
      .eq("id", invite.inviter_id)
      .maybeSingle();
    inviterName = inviter?.full_name ?? inviter?.email ?? null;
  }

  const isExpired = invite ? new Date(invite.expires_at) < new Date() : false;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-border bg-card p-8 shadow-lg">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Invite</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sprint Tracker</p>
        </div>

        {!invite ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              This invite link is invalid, was sent to a different email, or
              has been revoked.
            </p>
            <p className="text-xs text-muted-foreground">
              You&apos;re signed in as <strong>{user.email}</strong>. If the
              invite was sent to a different address, sign out and sign back in
              with the right account.
            </p>
            <Link
              href="/dashboard"
              className="inline-block rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              Back to dashboard
            </Link>
          </div>
        ) : invite.status !== "pending" ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              This invite is no longer pending (status:{" "}
              <strong>{invite.status}</strong>).
            </p>
            <Link
              href="/dashboard"
              className="inline-block rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              Back to dashboard
            </Link>
          </div>
        ) : isExpired ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              This invite has expired. Ask the sender to send a new one.
            </p>
            <Link
              href="/dashboard"
              className="inline-block rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              Back to dashboard
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              <strong>{inviterName ?? "Someone"}</strong>{" "}
              {invite.invite_type === "reviewer"
                ? "wants you to review their sprints. You'll get read-only access to their daily logs and weekly summaries (private notes hidden) and can leave feedback comments."
                : "wants to review your sprints. They'll get read-only access to your daily logs and weekly summaries (private notes hidden) and can leave feedback comments."}
            </p>
            <p className="text-xs text-muted-foreground">
              Sent to <strong>{invite.invitee_email}</strong>. You&apos;re
              signed in as <strong>{user.email}</strong>.
            </p>
            <AcceptInviteButton token={token} inviteType={invite.invite_type} />
          </div>
        )}
      </div>
    </div>
  );
}
