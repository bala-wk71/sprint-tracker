"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronRight, NotebookPen } from "lucide-react";

import { movePage, updatePage } from "./actions";

export function PageHeader({
  pageId,
  title,
  kind,
  meetingDate,
  attendees,
  breadcrumb,
  parentId,
  moveTargets,
}: {
  pageId: string;
  title: string;
  kind: "page" | "meeting";
  meetingDate: string | null;
  attendees: string | null;
  breadcrumb: { id: string; title: string }[];
  parentId: string | null;
  /** Every page this one may be nested under — its own subtree excluded. */
  moveTargets: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [titleValue, setTitleValue] = useState(title);
  const [dateValue, setDateValue] = useState(meetingDate ?? "");
  const [attendeesValue, setAttendeesValue] = useState(attendees ?? "");
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moving, startMoving] = useTransition();

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

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Move to
          <select
            value={parentId ?? ""}
            onChange={(e) => move(e.target.value)}
            disabled={moving}
            className="max-w-[16rem] rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
          >
            <option value="">Top level</option>
            {moveTargets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </select>
        </label>
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

      {kind === "meeting" && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Date
            <input
              type="date"
              value={dateValue}
              onChange={(e) => setDateValue(e.target.value)}
              onBlur={() =>
                void updatePage({ pageId, meetingDate: dateValue || null })
              }
              className="rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
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
