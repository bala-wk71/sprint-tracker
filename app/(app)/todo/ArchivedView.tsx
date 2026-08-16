"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Archive, ArchiveRestore, FileText, Trash2, SearchX } from "lucide-react";
import { cn } from "@/lib/utils";
import { setSectionArchived, deleteSection } from "./actions";
import { useTodoStore } from "./store";
import * as tree from "./tree";
import type { TodoSection } from "./types";

function ArchivedCard({
  section,
  path,
}: {
  section: TodoSection;
  path: string;
}) {
  const { run } = useTodoStore();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [open, setOpen] = useState(false);

  const counts = tree.countTasks([section]);
  const total = counts.pending + counts.completed;

  // Titles of everything filed under this section, subsections included.
  const titles = useMemo(() => {
    const out: { id: string; title: string; done: boolean }[] = [];
    const walk = (s: TodoSection) => {
      for (const t of s.tasks)
        out.push({ id: t.id, title: t.title, done: t.is_completed });
      s.subsections.forEach(walk);
    };
    walk(section);
    return out;
  }, [section]);

  const handleRestore = () => {
    run(
      (sections) =>
        tree.mapSection(sections, section.id, (s) => ({
          ...s,
          archived_at: null,
        })),
      () => setSectionArchived({ sectionId: section.id, archived: false })
    );
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      window.setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    run(
      (sections) => tree.removeSection(sections, section.id),
      () => deleteSection(section.id)
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {section.source_page_id && (
              <FileText
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                aria-label="From a note page"
              />
            )}
            <p className="truncate text-sm font-semibold text-foreground">
              {section.name}
            </p>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {path && <>{path} › </>}
            {total} {total === 1 ? "task" : "tasks"}
            {counts.pending > 0 && <> · {counts.pending} still open</>}
            {section.archived_at && (
              <>
                {" "}
                · archived{" "}
                {format(new Date(section.archived_at), "MMM d, HH:mm")}
              </>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {total > 0 && (
            <button
              onClick={() => setOpen((v) => !v)}
              className="rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {open ? "Hide" : "View"}
            </button>
          )}
          <button
            onClick={handleRestore}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArchiveRestore className="h-3.5 w-3.5" />
            Restore
          </button>
          <button
            onClick={handleDelete}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
              confirmDelete
                ? "border-destructive/50 bg-destructive/10 text-destructive"
                : "border-border text-muted-foreground hover:text-destructive"
            )}
            aria-label={confirmDelete ? "Confirm delete section" : "Delete section"}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {confirmDelete ? "Delete for good?" : "Delete"}
          </button>
        </div>
      </div>

      {open && titles.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-border pt-3">
          {titles.map((t) => (
            <li
              key={t.id}
              className={cn(
                "truncate text-xs",
                t.done
                  ? "text-muted-foreground line-through"
                  : "text-foreground"
              )}
            >
              {t.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ArchivedView({
  sections,
  searching,
}: {
  sections: TodoSection[];
  searching: boolean;
}) {
  const entries = useMemo(() => tree.collectArchived(sections), [sections]);

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border py-16 text-center">
        {searching ? (
          <>
            <SearchX className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">No matches</p>
            <p className="mt-1 text-xs text-muted-foreground">
              No archived section matches that search.
            </p>
          </>
        ) : (
          <>
            <Archive className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">
              Nothing archived
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Sections from your notes retire here once every item in them is
              done. You can also archive any section by hand.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Archived sections keep their tasks. Restore one to put it back on the
        board, or delete it to remove it for good.
      </p>
      {entries.map(({ section, path }) => (
        <ArchivedCard key={section.id} section={section} path={path} />
      ))}
    </div>
  );
}
