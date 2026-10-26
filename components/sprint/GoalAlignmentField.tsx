"use client";

import { Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { ALIGNMENTS, type Alignment, type AlignmentGoals } from "@/lib/planning/alignment";

/**
 * One line on how the week lines up with the goals being worked on. "Not
 * this week" is a fine answer; saying it is the point.
 */
export function GoalAlignmentField({
  goals,
  alignment,
  note,
  onAlignment,
  onNote,
  idPrefix = "sprint",
}: {
  goals: AlignmentGoals;
  alignment: Alignment | null;
  note: string;
  onAlignment: (value: Alignment) => void;
  onNote: (value: string) => void;
  idPrefix?: string;
}) {
  return (
    <fieldset className="space-y-2 rounded-md border border-border bg-background p-3">
      <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold text-foreground">
        <Target className="h-4 w-4 text-primary" />
        Does this week line up with your goals?
      </legend>
      <p className="text-xs text-muted-foreground">
        {goals.phase ? `${goals.phase}: ` : "Working on: "}
        {goals.goals.map((g) => g.title).join(" · ")}
      </p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Alignment">
        {ALIGNMENTS.map((a) => (
          <button
            key={a.value}
            type="button"
            role="radio"
            aria-checked={alignment === a.value}
            title={a.hint}
            onClick={() => onAlignment(a.value)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm",
              alignment === a.value
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
            )}
          >
            {a.label}
          </button>
        ))}
      </div>
      <label htmlFor={`${idPrefix}_alignment_note`} className="sr-only">
        In one line, why
      </label>
      <input
        id={`${idPrefix}_alignment_note`}
        value={note}
        maxLength={160}
        onChange={(e) => onNote(e.target.value)}
        placeholder={
          alignment === "off"
            ? "Why other things come first this week"
            : "In one line, how: e.g. gym 4x and the loan agreement draft"
        }
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
      />
    </fieldset>
  );
}
