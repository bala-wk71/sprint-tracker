"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Archive,
  CalendarClock,
  CalendarPlus,
  Check,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { archiveOldOccurrences, createPage } from "./actions";
import { formatMeetingDate } from "./kinds";
import type { Occurrence } from "./types";

const TIDY_CHOICES = [30, 60, 90] as const;

/**
 * A series is a shelf, not a document. It has no note body of its own — the
 * notes belong to the sittings — so this page is the list of sittings and the
 * two things you do to it: add today's, and clear out last quarter's.
 */
export function SeriesView({
  seriesId,
  occurrences,
}: {
  seriesId: string;
  occurrences: Occurrence[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tidyOpen, setTidyOpen] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const todaysSitting = occurrences.find((o) => o.meeting_date === today);

  const addOccurrence = () => {
    // Two notes for the same morning is the one mistake this button can make,
    // so if today already has a sitting it opens that instead of stacking a
    // second one beside it.
    if (todaysSitting) {
      router.push(`/notes/${todaysSitting.id}`);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createPage({
        parentId: seriesId,
        kind: "meeting",
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/notes/${result.data.id}`);
    });
  };

  const tidy = (days: (typeof TIDY_CHOICES)[number]) => {
    setTidyOpen(false);
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await archiveOldOccurrences({
        seriesId,
        olderThanDays: days,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const { archived, keptOpen } = result.data;
      setNotice(
        archived === 0 && keptOpen === 0
          ? `Nothing older than ${days} days to archive.`
          : [
              `Archived ${archived} ${archived === 1 ? "sitting" : "sittings"}.`,
              keptOpen > 0 &&
                `${keptOpen} kept — ${keptOpen === 1 ? "it still has" : "they still have"} an open action item.`,
            ]
              .filter(Boolean)
              .join(" ")
      );
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={addOccurrence}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <CalendarPlus className="h-4 w-4" />
          {todaysSitting ? "Open today's" : "Add occurrence"}
        </button>

        {occurrences.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setTidyOpen((open) => !open)}
              disabled={pending}
              aria-expanded={tidyOpen}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <Archive className="h-4 w-4" />
              Tidy up
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {tidyOpen && (
              <div className="absolute left-0 z-10 mt-1 w-56 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
                <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
                  Archive sittings older than
                </p>
                {TIDY_CHOICES.map((days) => (
                  <button
                    key={days}
                    onClick={() => tidy(days)}
                    className="block w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    {days} days
                  </button>
                ))}
                <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
                  Anything with an open action item is left alone.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
      {notice && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Check className="h-4 w-4 shrink-0" />
          {notice}
        </p>
      )}

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Occurrences
          {occurrences.length > 0 && (
            <span className="ml-2 font-normal text-muted-foreground">
              {occurrences.length}
            </span>
          )}
        </h2>

        {occurrences.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No sittings yet. Add one and the notes for that day live inside it —
            the series itself stays a shelf.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {occurrences.map((occurrence) => {
              const date = formatMeetingDate(occurrence.meeting_date);
              return (
                <li key={occurrence.id}>
                  <Link
                    href={`/notes/${occurrence.id}`}
                    className="flex items-center gap-3 rounded-md px-2 py-2.5 text-sm hover:bg-accent"
                  >
                    <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                      {occurrence.title}
                    </span>
                    {date && date !== occurrence.title && (
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {date}
                      </span>
                    )}
                    <span
                      className={cn(
                        "shrink-0 text-xs",
                        occurrence.openItems > 0
                          ? "text-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {occurrence.totalItems === 0
                        ? "no items"
                        : occurrence.openItems === 0
                          ? `${occurrence.totalItems} done`
                          : `${occurrence.openItems} open`}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
