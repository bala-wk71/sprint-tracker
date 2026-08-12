"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Loader2,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExtractedActionItem } from "@/lib/ai/notes";
import { addActionItems } from "./actions";
import { enhanceNotes, extractActionItems } from "./ai";

type Proposal = ExtractedActionItem & { accepted: boolean };

export function AiPanel({ pageId }: { pageId: string }) {
  const router = useRouter();
  const [extracting, startExtracting] = useTransition();
  const [enhancing, startEnhancing] = useTransition();
  const [adding, startAdding] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);

  const busy = extracting || enhancing || adding;

  const extract = () => {
    setError(null);
    startExtracting(async () => {
      const result = await extractActionItems(pageId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Someone else's commitment is worth showing but is not your task, so
      // it starts unchecked and cannot be accepted.
      setProposals(
        result.data.items.map((item) => ({
          ...item,
          accepted: item.owner === "me",
        }))
      );
    });
  };

  const enhance = () => {
    setError(null);
    startEnhancing(async () => {
      const result = await enhanceNotes(pageId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const accept = () => {
    if (!proposals) return;
    const chosen = proposals.filter((p) => p.accepted && p.owner === "me");
    if (chosen.length === 0) return;

    startAdding(async () => {
      const result = await addActionItems({
        pageId,
        items: chosen.map((p) => ({
          title: p.title,
          dueDate: p.due_date ?? null,
        })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setProposals(null);
      router.refresh();
    });
  };

  const acceptedCount =
    proposals?.filter((p) => p.accepted && p.owner === "me").length ?? 0;

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={extract}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {extracting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wand2 className="h-4 w-4" />
          )}
          {extracting ? "Reading your notes…" : "Extract action items"}
        </button>

        <button
          onClick={enhance}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {enhancing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {enhancing ? "Cleaning up…" : "Clean up notes"}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="flex-1">{error}</p>
          <button
            onClick={() => setError(null)}
            className="shrink-0 rounded p-0.5 hover:bg-destructive/10"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {proposals !== null && proposals.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No commitments found in this page.
        </p>
      )}

      {proposals !== null && proposals.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Nothing is saved until you accept it.
          </p>

          <ul className="space-y-1">
            {proposals.map((proposal, index) => {
              const mine = proposal.owner === "me";
              return (
                <li
                  key={`${proposal.title}-${index}`}
                  className={cn(
                    "flex items-start gap-2 rounded-md px-2 py-2",
                    mine ? "hover:bg-accent" : "opacity-60"
                  )}
                >
                  <button
                    onClick={() =>
                      setProposals((prev) =>
                        (prev ?? []).map((p, i) =>
                          i === index ? { ...p, accepted: !p.accepted } : p
                        )
                      )
                    }
                    disabled={!mine || adding}
                    role="checkbox"
                    aria-checked={proposal.accepted}
                    aria-label={`Accept "${proposal.title}"`}
                    className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      proposal.accepted
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border",
                      mine ? "hover:border-primary" : "cursor-not-allowed"
                    )}
                  >
                    {proposal.accepted && <Check className="h-3 w-3" />}
                  </button>

                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-sm text-foreground">{proposal.title}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {!mine && (
                        <span>
                          {proposal.owner_name
                            ? `Assigned to ${proposal.owner_name}`
                            : "Assigned to someone else"}
                        </span>
                      )}
                      {proposal.due_date && (
                        <span className="tabular-nums">
                          Due {proposal.due_date}
                        </span>
                      )}
                      {proposal.confidence === "low" && <span>Unsure</span>}
                    </div>
                    {proposal.source_quote && (
                      <p className="text-xs italic text-muted-foreground">
                        “{proposal.source_quote}”
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={accept}
              disabled={adding || acceptedCount === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {adding && <Loader2 className="h-4 w-4 animate-spin" />}
              Add {acceptedCount} item{acceptedCount === 1 ? "" : "s"}
            </button>
            <button
              onClick={() => setProposals(null)}
              disabled={adding}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
