"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { RefreshCw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  directionOf,
  lookedAtLabel,
  reasonsOf,
  type SavedGoalReview,
} from "@/lib/goals/review";

type Props = {
  goalId: string;
  latest: SavedGoalReview | null;
  previous: SavedGoalReview | null;
  coachReadsJournal: boolean;
};

const dayLabel = (iso: string) => format(new Date(iso), "d MMM yyyy");

/** "How am I doing?" — the coach's saved reading of one goal. */
export function GoalReview({ goalId, latest, previous, coachReadsJournal }: Props) {
  const [review, setReview] = useState(latest);
  const [prior, setPrior] = useState(previous);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/goal-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goalId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "The review failed.");
        return;
      }
      setPrior(review);
      setReview(data.review);
    } catch {
      setError("Could not reach the coach. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  const direction = review ? directionOf(review.direction) : null;
  const reasons = review ? reasonsOf(review.reasons) : [];
  const lookedAt = review ? lookedAtLabel(review.input_counts) : "";

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground">How am I doing?</h2>
          <p className="mt-0.5 max-w-prose text-xs text-muted-foreground">
            The coach reads this goal&apos;s check-ins, steps and logged hours
            {coachReadsJournal ? ", and what you wrote in check-ins," : ""} and
            tells you where you stand. Once a week per goal.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="flex shrink-0 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {review ? (
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {loading ? "Reading…" : review ? "Ask again" : "Ask the coach"}
        </button>
      </div>

      {!coachReadsJournal && (
        <p className="mt-2 text-xs text-muted-foreground">
          The coach can&apos;t see what you write, only the numbers.{" "}
          <Link href="/settings#coach" className="text-primary hover:underline">
            Change this in Settings
          </Link>
          .
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {review && direction && !loading && (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", direction.tone)}>
              {direction.label}
            </span>
            <span className="text-xs text-muted-foreground">
              {dayLabel(review.created_at)}
              {lookedAt && ` · looked at ${lookedAt}`}
            </span>
          </div>

          <p className="text-sm leading-relaxed text-foreground">{review.summary}</p>

          {reasons.length > 0 && (
            <ol className="ml-5 list-decimal space-y-1.5 text-sm leading-relaxed text-foreground">
              {reasons.map((r, i) => (
                <li key={i}>
                  {r.text}
                  {r.dates && (
                    <span className="ml-1.5 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                      {r.dates}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}

          {review.next_step && (
            <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-foreground">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                One next step
              </span>
              {review.next_step}
            </div>
          )}

          {prior && (
            <p className="text-xs text-muted-foreground">
              Last review ({dayLabel(prior.created_at)}): {directionOf(prior.direction).label}.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
