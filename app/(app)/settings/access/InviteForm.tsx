"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createInvite } from "./actions";

export function InviteForm({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [type, setType] = useState<"reviewer" | "owner">("reviewer");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await createInvite({
        invitee_email: email,
        invite_type: type,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEmail("");
      setSuccess("Invite sent. Share the link from the list below.");
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto]">
        <input
          type="email"
          placeholder="friend@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={pending || disabled}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as "reviewer" | "owner")}
          disabled={pending || disabled}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        >
          <option value="reviewer">As my reviewer</option>
          <option value="owner">To review them</option>
        </select>
        <button
          type="button"
          onClick={submit}
          disabled={pending || disabled || !email.trim()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send invite"}
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        <strong>As my reviewer:</strong> they get read-only access to your
        sprints and can leave feedback.{" "}
        <strong>To review them:</strong> when they accept, you become their
        reviewer.
      </p>

      {disabled && (
        <p className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-700 dark:text-yellow-400">
          You&apos;ve hit the pending-invite cap. Revoke one to send another.
        </p>
      )}

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
          {success}
        </p>
      )}
    </div>
  );
}
