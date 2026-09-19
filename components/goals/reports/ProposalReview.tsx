"use client";

import { useState } from "react";
import { CalendarRange } from "lucide-react";
import type { PlanDraft } from "@/lib/planning/draft";
import { DraftReview } from "@/components/goals/plan/draft/DraftReview";
import { markProposalSaved } from "@/app/(app)/goals/reports/actions";

/**
 * Next quarter's plan from a quarterly review, on the same review screen as
 * any other plan draft. Nothing is saved until "Save plan".
 */
export function ProposalReview({
  reportId,
  draft: initial,
  warnings,
  todayIso,
  existingStreams,
}: {
  reportId: string;
  draft: PlanDraft;
  warnings: string[];
  todayIso: string;
  existingStreams: string[];
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(initial);
  const quarters = initial.goals.filter((g) => g.level === "quarter");

  return (
    <section className="space-y-3 rounded-xl border border-primary/40 bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <CalendarRange className="h-5 w-5 text-primary" aria-hidden />
            Next quarter, proposed
          </h2>
          <ul className="space-y-0.5 text-sm text-muted-foreground">
            {quarters.map((g) => (
              <li key={g.key}>
                <span className="text-foreground">{g.title}</span>
                {g.steps.length > 0 && ` · ${g.steps.length} ${g.steps.length === 1 ? "project" : "projects"}`}
              </li>
            ))}
          </ul>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Review and save
          </button>
        )}
      </div>
      {open && (
        <DraftReview
          draft={draft}
          warnings={warnings}
          todayIso={todayIso}
          existingStreams={existingStreams}
          onChange={setDraft}
          onSaved={() => {
            void markProposalSaved(reportId);
          }}
        />
      )}
    </section>
  );
}
