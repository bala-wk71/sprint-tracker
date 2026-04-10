"use client";

import { useTransition } from "react";
import { deleteSprintAndRedirect } from "./actions";

export function DeleteSprintButton({ sprintId }: { sprintId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (
          !confirm(
            "Delete this sprint and all its tasks? This cannot be undone."
          )
        ) {
          return;
        }
        startTransition(async () => {
          await deleteSprintAndRedirect(sprintId);
        });
      }}
      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-destructive hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
    >
      {pending ? "Deleting…" : "Delete sprint"}
    </button>
  );
}
