"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { deletePage, setPageArchived } from "../actions";
import { KIND_META, formatMeetingDate, KindIcon } from "../kinds";
import type { NoteKind } from "../types";

export type ArchivedBranch = {
  id: string;
  title: string;
  kind: NoteKind;
  meetingDate: string | null;
  archivedAt: string;
  /** What went in with it, capped — enough to recognise, not to scroll. */
  contents: {
    id: string;
    title: string;
    kind: NoteKind;
    meetingDate: string | null;
  }[];
  insideCount: number;
};

function BranchCard({ branch }: { branch: ArchivedBranch }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const date = formatMeetingDate(branch.meetingDate);

  const restore = () => {
    startTransition(async () => {
      const result = await setPageArchived({
        pageId: branch.id,
        archived: false,
      });
      if (result.ok) router.refresh();
    });
  };

  // Two clicks, not a confirm dialog — this is the only place a page can be
  // destroyed, and the second click has to be a decision rather than a reflex.
  const remove = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      window.setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    startTransition(async () => {
      const result = await deletePage(branch.id);
      if (result.ok) router.refresh();
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <KindIcon
              kind={branch.kind}
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            />
            <p className="truncate text-sm font-semibold text-foreground">
              {branch.title}
            </p>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {KIND_META[branch.kind].label.toLowerCase()}
            {date && <> · {date}</>}
            {branch.insideCount > 0 && (
              <>
                {" "}
                · {branch.insideCount}{" "}
                {branch.kind === "series"
                  ? branch.insideCount === 1
                    ? "occurrence"
                    : "occurrences"
                  : branch.insideCount === 1
                    ? "page"
                    : "pages"}{" "}
                inside
              </>
            )}{" "}
            · archived {format(new Date(branch.archivedAt), "MMM d, HH:mm")}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1">
          {branch.insideCount > 0 && (
            <button
              onClick={() => setOpen((value) => !value)}
              className="rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {open ? "Hide" : "View"}
            </button>
          )}
          <button
            onClick={restore}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <ArchiveRestore className="h-3.5 w-3.5" />
            Restore
          </button>
          <button
            onClick={remove}
            disabled={pending}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
              confirmDelete
                ? "border-destructive/50 bg-destructive/10 text-destructive"
                : "border-border text-muted-foreground hover:text-destructive"
            )}
            aria-label={confirmDelete ? "Confirm delete" : "Delete for good"}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {confirmDelete ? "Delete for good?" : "Delete"}
          </button>
        </div>
      </div>

      {open && branch.contents.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-border pt-3">
          {branch.contents.map((child) => (
            <li
              key={child.id}
              className="flex items-center gap-2 truncate text-xs text-muted-foreground"
            >
              <span className="truncate">{child.title}</span>
            </li>
          ))}
          {branch.insideCount > branch.contents.length && (
            <li className="text-xs text-muted-foreground/70">
              …and {branch.insideCount - branch.contents.length} more
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export function ArchiveList({ branches }: { branches: ArchivedBranch[] }) {
  if (branches.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border py-16 text-center">
        <Archive className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
        <p className="text-sm font-medium text-foreground">Nothing archived</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Archive a page from its header, or clear out a run of old meetings
          with <span className="font-medium">Tidy up</span> on a series.
        </p>
        <Link
          href="/notes"
          className="mt-4 inline-block text-xs font-medium text-primary hover:underline"
        >
          Back to notes
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {branches.map((branch) => (
        <BranchCard key={branch.id} branch={branch} />
      ))}
    </div>
  );
}
