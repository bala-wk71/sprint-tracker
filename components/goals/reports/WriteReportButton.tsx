"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WrittenPeriod } from "@/lib/ai/reports";
import { writeReport } from "@/app/(app)/goals/reports/actions";

/** Writes (or rewrites) a month, quarter or year report, then opens it. */
export function WriteReportButton({
  period,
  start,
  label,
  rewrite = false,
  primary = true,
}: {
  period: WrittenPeriod;
  start: string;
  label: string;
  rewrite?: boolean;
  primary?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = () =>
    startTransition(async () => {
      setError(null);
      const result = await writeReport({ period, start });
      if (!result.ok) return setError(result.error);
      router.push(`/goals/reports/${result.data.id}`);
      router.refresh();
    });

  const Icon = rewrite ? RefreshCw : Sparkles;
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium disabled:opacity-60",
          primary
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "border border-border text-foreground hover:bg-accent"
        )}
      >
        <Icon className={cn("h-4 w-4", pending && rewrite && "animate-spin")} />
        {pending ? "Writing… (about 20 seconds)" : label}
      </button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
