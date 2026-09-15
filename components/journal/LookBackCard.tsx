"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, Loader2 } from "lucide-react";

type Props = {
  coachReadsJournal: boolean;
  /** "August" — the month the letter would describe. */
  monthLabel: string;
  /** The journal entry id when last month's letter already exists. */
  existingId: string | null;
};

/** The monthly look-back: written only when asked, and only with permission. */
export function LookBackCard({ coachReadsJournal, monthLabel, existingId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [writtenId, setWrittenId] = useState<string | null>(null);
  const id = writtenId ?? existingId;

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/look-back", { method: "POST" });
      const data = await res.json();
      if (data.id) setWrittenId(data.id);
      if (!res.ok) {
        if (!data.id) setError(data.error ?? "The look-back failed.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the coach. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <Bot className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Your {monthLabel} look-back</p>
          <p className="text-xs text-muted-foreground">
            {!coachReadsJournal ? (
              <>
                The coach can write you a short letter about last month once you{" "}
                <Link href="/settings#coach" className="text-primary hover:underline">
                  let it read your journal
                </Link>
                .
              </>
            ) : id ? (
              "It's in your journal, marked as from the coach."
            ) : (
              "A short letter from the coach: what kept coming up, how your mood moved, and one question for next month."
            )}
          </p>
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
      </div>

      {coachReadsJournal &&
        (id ? (
          <Link
            href={`/journal/${id}`}
            className="shrink-0 self-start rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent sm:self-auto"
          >
            Read it
          </Link>
        ) : (
          <button
            type="button"
            onClick={run}
            disabled={loading}
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 sm:self-auto"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Writing…" : "Write it"}
          </button>
        ))}
    </section>
  );
}
