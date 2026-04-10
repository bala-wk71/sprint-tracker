"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeReviewer } from "./actions";

type Reviewer = {
  relationshipId: string;
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  since: string;
};

export function ReviewersList({
  reviewers,
  allowRemove,
}: {
  reviewers: Reviewer[];
  allowRemove?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (reviewers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No one is reviewing you yet. Send an invite above to share access.
      </p>
    );
  }

  const remove = (relationshipId: string, name: string) => {
    if (
      !confirm(
        `Remove ${name} as a reviewer? They will lose access to your sprints immediately.`
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await removeReviewer(relationshipId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {reviewers.map((reviewer) => {
          const initials = reviewer.name
            .split(" ")
            .map((part) => part[0])
            .filter(Boolean)
            .slice(0, 2)
            .join("")
            .toUpperCase();

          return (
            <li
              key={reviewer.relationshipId}
              className="flex items-center justify-between rounded-md border border-border bg-background p-3"
            >
              <div className="flex items-center gap-3">
                {reviewer.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={reviewer.avatarUrl}
                    alt={reviewer.name}
                    className="h-9 w-9 rounded-full"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                    {initials || "?"}
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {reviewer.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {reviewer.email} · since {reviewer.since}
                  </p>
                </div>
              </div>
              {allowRemove && (
                <button
                  type="button"
                  onClick={() => remove(reviewer.relationshipId, reviewer.name)}
                  disabled={pending}
                  className="rounded-md px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
