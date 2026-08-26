"use client";

import { useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { Markdown } from "@/components/shared/Markdown";

/**
 * The "how am I actually doing" button.
 *
 * Not stored anywhere: a report is a reading of the numbers at a moment, and a
 * saved one goes stale the next time anything is logged.
 */
export function ProgressReport() {
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/health-report", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "The analysis failed.");
        return;
      }
      setReport(data.report);
    } catch {
      setError("Could not reach the assistant. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            How is it actually going?
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Reads your weight trend, lift progress and food against the goals
            you set, and picks one thing to change.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="flex shrink-0 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {report ? (
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {loading ? "Reading…" : report ? "Again" : "Analyse my progress"}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {report && !loading && (
        <div className="mt-4 border-t border-border pt-4">
          <Markdown content={report} />
          <p className="mt-3 text-xs text-muted-foreground">
            Estimates, not measurements — nutrition figures in particular are
            your own guesses. Not medical advice.
          </p>
        </div>
      )}
    </div>
  );
}
