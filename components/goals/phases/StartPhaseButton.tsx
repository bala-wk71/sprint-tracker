"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Flag } from "lucide-react";
import { startNextPhase } from "@/app/(app)/goals/phase-actions";

export function StartPhaseButton({ label }: { label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const start = () =>
    startTransition(async () => {
      setError(null);
      const result = await startNextPhase();
      if (!result.ok) return setError(result.error);
      router.push("/goals");
      router.refresh();
    });

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={start}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        <Flag className="h-4 w-4" />
        {pending ? "Starting…" : label}
      </button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
