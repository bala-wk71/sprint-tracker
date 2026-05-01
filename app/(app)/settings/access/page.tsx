import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { MAX_INVITES } from "@/lib/constants";
import { InviteForm } from "./InviteForm";
import { PendingInvitesList } from "./PendingInvitesList";
import { ReviewersList } from "./ReviewersList";

export default async function AccessSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Sent invites (any status)
  const { data: inviteRows } = await supabase
    .from("invites")
    .select("id, invitee_email, invite_type, status, expires_at, created_at, token")
    .eq("inviter_id", user.id)
    .order("created_at", { ascending: false });

  const invites = inviteRows ?? [];
  const pendingCount = invites.filter((i) => i.status === "pending").length;
  const remainingInvites = Math.max(0, MAX_INVITES - pendingCount);

  // People reviewing me (I am the owner)
  const { data: myReviewers } = await supabase
    .from("reviewer_relationships")
    .select("id, reviewer_id, created_at, users!reviewer_relationships_reviewer_id_fkey(id, full_name, email, avatar_url)")
    .eq("owner_id", user.id);

  // People I am reviewing (I am the reviewer)
  const { data: iReview } = await supabase
    .from("reviewer_relationships")
    .select("id, owner_id, created_at, users!reviewer_relationships_owner_id_fkey(id, full_name, email, avatar_url)")
    .eq("reviewer_id", user.id);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            Settings
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Access</h1>
          <p className="text-sm text-muted-foreground">
            Invite reviewers to see your sprints, or accept invites from people
            you want to review.
          </p>
        </div>
      </div>

      <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Send an invite</h2>
          <span className="text-xs text-muted-foreground">
            {remainingInvites} of {MAX_INVITES} invites remaining
          </span>
        </div>
        <InviteForm disabled={remainingInvites === 0} />
      </section>

      <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Sent invites</h2>
        <PendingInvitesList
          invites={invites.map((i) => ({
            id: i.id,
            invitee_email: i.invitee_email,
            invite_type: i.invite_type,
            status: i.status,
            expires_at: i.expires_at,
            created_at: i.created_at,
            token: i.token,
          }))}
        />
      </section>

      <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          People reviewing you
        </h2>
        <ReviewersList
          reviewers={(myReviewers ?? []).map((r) => ({
            relationshipId: r.id,
            id: r.users?.id ?? r.reviewer_id,
            name: r.users?.full_name ?? r.users?.email ?? "Unknown",
            email: r.users?.email ?? "",
            avatarUrl: r.users?.avatar_url ?? null,
            since: format(new Date(r.created_at), "MMM d, yyyy"),
          }))}
          allowRemove
        />
      </section>

      <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          People you review
        </h2>
        {(iReview ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You aren&apos;t reviewing anyone yet. Accept an invite link from
            someone to start.
          </p>
        ) : (
          <ul className="space-y-2">
            {(iReview ?? []).map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between rounded-md border border-border bg-background p-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {r.users?.full_name ?? r.users?.email ?? "Unknown"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.users?.email}
                  </p>
                </div>
                <Link
                  href={`/review/${r.owner_id}`}
                  className="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-accent"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
