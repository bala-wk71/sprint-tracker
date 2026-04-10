"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptInvite } from "./actions";

export function AcceptInviteButton({
  token,
  inviteType,
}: {
  token: string;
  inviteType: "reviewer" | "owner";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await acceptInvite(token);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Reviewer of someone → land on their review page.
      // Owner with a new reviewer → land on access settings to confirm.
      const target =
        inviteType === "owner"
          ? `/review/${result.ownerId}`
          : "/settings/access";
      router.push(target);
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {pending ? "Accepting…" : "Accept invite"}
      </button>
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
