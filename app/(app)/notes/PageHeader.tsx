"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Archive, ChevronRight, NotebookPen } from "lucide-react";

import { movePage, setPageArchived, updatePage } from "./actions";
import { KIND_META } from "./kinds";
import type { NoteKind } from "./types";

export function PageHeader({
  pageId,
  title,
  kind,
  meetingDate,
  attendees,
  breadcrumb,
  parentId,
  moveTargets,
  descendantCount,
}: {
  pageId: string;
  title: string;
  kind: NoteKind;
  meetingDate: string | null;
  attendees: string | null;
  breadcrumb: { id: string; title: string }[];
  parentId: string | null;
  /** Every page this one may be nested under — its own subtree, and anything
   *  whose kind refuses this one, already excluded. */
  moveTargets: { id: string; label: string }[];
  /** How much goes with it, so the confirm can say so. */
  descendantCount: number;
}) {
  const router = useRouter();
  const [titleValue, setTitleValue] = useState(title);
  const [dateValue, setDateValue] = useState(meetingDate ?? "");
  const [attendeesValue, setAttendeesValue] = useState(attendees ?? "");
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moving, startMoving] = useTransition();
  const [archiving, startArchiving] = useTransition();

  const archive = () => {
    const what = KIND_META[kind].label.toLowerCase();
    const message =
      descendantCount > 0
        ? `Archive this ${what} and the ${descendantCount} ${descendantCount === 1 ? "page" : "pages"} inside it? You can restore it from the archive.`
        : `Archive this ${what}? You can restore it from the archive.`;
    if (!confirm(message)) return;

    startArchiving(async () => {
      const result = await setPageArchived({ pageId, archived: true });
      if (!result.ok) {
        setMoveError(result.error);
        return;
      }
      router.push("/notes");
    });
  };

  const move = (value: string) => {
    setMoveError(null);
    startMoving(async () => {
      const result = await movePage({ pageId, parentId: value || null });
      if (!result.ok) {
        setMoveError(result.error);
        return;
      }
      router.refresh();
    });
  };

  // Renaming changes the sidebar tree, so this one does refresh — on commit
  // only, never per keystroke.
  const commitTitle = async () => {
    const next = titleValue.trim();
    if (!next || next === title) {
      setTitleValue(title);
      return;
    }
    const result = await updatePage({ pageId, title: next });
    if (result.ok) router.refresh();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <Link href="/notes" className="hover:text-foreground">
            <NotebookPen className="h-3.5 w-3.5" />
            <span className="sr-only">All notes</span>
          </Link>
          {breadcrumb.map((crumb) => (
            <span key={crumb.id} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3" />
              <Link
                href={`/notes/${crumb.id}`}
                className="hover:text-foreground"
              >
                {crumb.title}
              </Link>
            </span>
          ))}
        </nav>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          Move to
          <select
            value={parentId ?? ""}
            onChange={(e) => move(e.target.value)}
            disabled={moving}
            className="min-w-0 max-w-[16rem] rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
          >
            <option value="">Top level</option>
            {moveTargets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </select>
        </label>

        <button
          onClick={archive}
          disabled={archiving}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          title="Archive this page"
        >
          <Archive className="h-3.5 w-3.5" />
          Archive
        </button>
        </div>
      </div>

      {moveError && (
        <p className="flex items-center gap-2 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" />
          {moveError}
        </p>
      )}

      <input
        value={titleValue}
        onChange={(e) => setTitleValue(e.target.value)}
        onBlur={() => void commitTitle()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setTitleValue(title);
        }}
        aria-label="Page title"
        className="w-full rounded-md bg-transparent text-2xl font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
      />

      {kind === "series" && (
        <label className="flex w-full min-w-0 items-center gap-2 text-xs text-muted-foreground sm:max-w-md">
          Usually with
          <input
            value={attendeesValue}
            onChange={(e) => setAttendeesValue(e.target.value)}
            onBlur={() => void updatePage({ pageId, attendees: attendeesValue })}
            placeholder="Who is normally in the room"
            className="min-w-0 flex-1 rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
      )}

      {kind === "meeting" && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex w-full items-center gap-2 text-xs text-muted-foreground sm:w-auto">
            Date
            <input
              type="date"
              value={dateValue}
              onChange={(e) => setDateValue(e.target.value)}
              onBlur={() =>
                void updatePage({ pageId, meetingDate: dateValue || null })
              }
              className="min-w-0 flex-1 rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary sm:flex-none"
            />
          </label>
          <label className="flex w-full min-w-0 items-center gap-2 text-xs text-muted-foreground sm:flex-1">
            With
            <input
              value={attendeesValue}
              onChange={(e) => setAttendeesValue(e.target.value)}
              onBlur={() => void updatePage({ pageId, attendees: attendeesValue })}
              placeholder="Who was in the room"
              className="min-w-0 flex-1 rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
        </div>
      )}
    </div>
  );
}
