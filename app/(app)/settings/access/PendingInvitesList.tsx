"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { revokeInvite } from "./actions";

type Invite = {
  id: string;
  invitee_email: string;
  invite_type: "reviewer" | "owner";
  status: "pending" | "accepted" | "expired" | "revoked";
  expires_at: string;
  created_at: string;
  token: string;
};

const STATUS_STYLES: Record<Invite["status"], string> = {
  pending: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  accepted: "bg-green-500/15 text-green-700 dark:text-green-400",
  expired: "bg-muted text-muted-foreground",
  revoked: "bg-muted text-muted-foreground",
};

const TYPE_LABELS = {
  reviewer: "As my reviewer",
  owner: "To review them",
} as const;

export function PendingInvitesList({ invites }: { invites: Invite[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (invites.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No invites sent yet.
      </p>
    );
  }

  const revoke = (id: string) => {
    if (!confirm("Revoke this invite? The link will stop working.")) return;
    setError(null);
    startTransition(async () => {
      const result = await revokeInvite(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const copyLink = async (token: string, id: string) => {
    const url = `${window.location.origin}/invite/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 2000);
    } catch {
      // Fallback: select the URL into a textarea so the user can copy.
      window.prompt("Copy this invite link:", url);
    }
  };

  return (
    <div className="space-y-2">
      {invites.map((invite) => (
        <div
          key={invite.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background p-3"
        >
          <div className="flex flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {invite.invitee_email}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${STATUS_STYLES[invite.status]}`}
              >
                {invite.status}
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                {TYPE_LABELS[invite.invite_type]}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Sent {format(new Date(invite.created_at), "MMM d, yyyy")}
              {invite.status === "pending" && (
                <>
                  {" "}· Expires {format(new Date(invite.expires_at), "MMM d, yyyy")}
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {invite.status === "pending" && (
              <>
                <button
                  type="button"
                  onClick={() => copyLink(invite.token, invite.id)}
                  className="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-accent"
                >
                  {copiedId === invite.id ? "Copied!" : "Copy link"}
                </button>
                <button
                  type="button"
                  onClick={() => revoke(invite.id)}
                  disabled={pending}
                  className="rounded-md px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                >
                  Revoke
                </button>
              </>
            )}
          </div>
        </div>
      ))}

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
