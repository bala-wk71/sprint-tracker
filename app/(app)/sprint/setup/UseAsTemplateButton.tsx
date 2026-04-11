"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { rolloverSprint } from "./actions";

type Props = {
  templateSprintId: string;
  defaultWeekStart: string;
};

export function UseAsTemplateButton({ templateSprintId, defaultWeekStart }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [weekStart, setWeekStart] = useState(defaultWeekStart);
  const [error, setError] = useState<string | null>(null);

  const handleRollover = () => {
    setError(null);
    startTransition(async () => {
      const result = await rolloverSprint(templateSprintId, weekStart);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/sprint/${result.sprintId}`);
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:border-primary hover:text-foreground"
        title="Create a new sprint pre-filled with these tasks"
      >
        <Copy className="h-3 w-3" />
        Use as template
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="date"
        value={weekStart}
        onChange={(e) => setWeekStart(e.target.value)}
        className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <button
        type="button"
        onClick={handleRollover}
        disabled={pending}
        className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create sprint"}
      </button>
      <button
        type="button"
        onClick={() => { setOpen(false); setError(null); }}
        disabled={pending}
        className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent"
      >
        Cancel
      </button>
      {error && (
        <span className="text-xs text-destructive">{error}</span>
      )}
    </div>
  );
}
