"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  WEEK_START_OPTIONS,
  weekStartDayName,
  type WeekStartDay,
} from "@/lib/week";
import { updatePreferences } from "./preferences-actions";

type Props = {
  weekStartDay: WeekStartDay;
  todoAutoArchive: boolean;
  coachReadsJournal: boolean;
};

export function PreferencesForm({
  weekStartDay: initialWeekStartDay,
  todoAutoArchive: initialAutoArchive,
  coachReadsJournal: initialCoachReadsJournal,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [weekStartDay, setWeekStartDay] = useState(initialWeekStartDay);
  const [autoArchive, setAutoArchive] = useState(initialAutoArchive);
  const [coachReadsJournal, setCoachReadsJournal] = useState(initialCoachReadsJournal);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = (next: Partial<Props>) => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updatePreferences({
        weekStartDay: next.weekStartDay,
        todoAutoArchive: next.todoAutoArchive,
        coachReadsJournal: next.coachReadsJournal,
      });
      if (!result.ok) {
        setError(result.error);
        // Put the controls back to what the server still holds.
        setWeekStartDay(initialWeekStartDay);
        setAutoArchive(initialAutoArchive);
        setCoachReadsJournal(initialCoachReadsJournal);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  const handleWeekStart = (day: WeekStartDay) => {
    setWeekStartDay(day);
    save({ weekStartDay: day });
  };

  const handleAutoArchive = (value: boolean) => {
    setAutoArchive(value);
    save({ todoAutoArchive: value });
  };

  const handleCoachReadsJournal = (value: boolean) => {
    setCoachReadsJournal(value);
    save({ coachReadsJournal: value });
  };

  return (
    <div className="space-y-6">
      <div>
        <label
          htmlFor="week_start_day"
          className="block text-sm font-medium text-foreground"
        >
          Week starts on
        </label>
        <p className="mt-1 text-xs text-muted-foreground">
          Sprints run for seven days from this day. The dashboard, daily log and
          analytics all group your weeks by it.
        </p>
        <select
          id="week_start_day"
          value={weekStartDay}
          disabled={pending}
          onChange={(e) =>
            handleWeekStart(Number(e.target.value) as WeekStartDay)
          }
          className="mt-2 w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 sm:w-auto"
        >
          {WEEK_START_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-muted-foreground">
          Existing sprints keep the day they were filed under. A sprint saved on
          a different day won&apos;t line up with a{" "}
          {weekStartDayName(weekStartDay)} week — recreate it if a past week
          looks empty.
        </p>
      </div>

      <div className="border-t border-border pt-6">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={autoArchive}
            disabled={pending}
            onChange={(e) => handleAutoArchive(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-input"
          />
          <span>
            <span className="block text-sm font-medium text-foreground">
              Archive finished note sections automatically
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              Each note page gets its own todo section. With this on, a section
              retires to the Archived tab as soon as its last item is ticked
              off. You can always archive or restore one by hand.
            </span>
          </span>
        </label>
      </div>

      <div id="coach" className="scroll-mt-20 border-t border-border pt-6">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={coachReadsJournal}
            disabled={pending}
            onChange={(e) => handleCoachReadsJournal(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-input"
          />
          <span>
            <span className="block text-sm font-medium text-foreground">
              Let the coach read my journal
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              Off until you turn it on. With it on, goal reviews can use what
              you wrote in check-ins, and the coach can write you a monthly
              look-back from your journal. Entries marked &ldquo;Keep from the
              coach&rdquo; are always skipped, and your reviewers&apos; access
              doesn&apos;t change.
            </span>
          </span>
        </label>
      </div>

      <div className="flex min-h-[20px] items-center gap-2 text-xs">
        {error && <span className="text-destructive">{error}</span>}
        {!error && saved && !pending && (
          <span className={cn("inline-flex items-center gap-1 text-muted-foreground")}>
            <Check className="h-3.5 w-3.5" />
            Saved
          </span>
        )}
        {pending && <span className="text-muted-foreground">Saving…</span>}
      </div>
    </div>
  );
}
