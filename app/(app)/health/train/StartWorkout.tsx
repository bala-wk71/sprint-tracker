"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Dumbbell, RotateCcw } from "lucide-react";
import { repeatLastWorkout, startWorkout } from "./actions";

export function StartWorkout({
  logDate,
  lastWorkout,
}: {
  logDate: string;
  lastWorkout: { log_date: string; name: string | null; exerciseCount: number } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const begin = (run: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await run();
      if (!result.ok) {
        setError(result.error ?? "Could not start the session.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 text-center sm:p-10">
      <Dumbbell className="mx-auto h-7 w-7 text-muted-foreground" />
      <h2 className="mt-3 text-lg font-semibold text-foreground">
        Nothing logged for {format(new Date(`${logDate}T00:00:00`), "d MMM")} yet
      </h2>

      <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
        {/* The single most likely workout is the last one, so it gets the
            primary button and one tap. */}
        {lastWorkout && (
          <button
            type="button"
            disabled={pending}
            onClick={() => begin(() => repeatLastWorkout(logDate))}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 sm:w-auto"
          >
            <RotateCcw className="h-4 w-4" />
            Repeat {lastWorkout.name ?? "last workout"}
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => begin(() => startWorkout({ logDate }))}
          className="w-full rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50 sm:w-auto"
        >
          Start an empty session
        </button>
      </div>

      {lastWorkout && (
        <p className="mt-3 text-xs text-muted-foreground">
          {lastWorkout.exerciseCount} exercise
          {lastWorkout.exerciseCount === 1 ? "" : "s"} from{" "}
          {format(new Date(`${lastWorkout.log_date}T00:00:00`), "d MMM")}, ready
          to fill in.
        </p>
      )}

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </div>
  );
}
