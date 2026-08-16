"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Archive, X } from "lucide-react";
import { setSectionArchived, type ArchiveEffect } from "./actions";
import * as tree from "./tree";
import type { TodoSection } from "./types";

type Result = { ok: boolean; error?: string };

/** A transient bar telling the user about something the server did on its own. */
type Notice = { message: string; undo?: () => void };

type TodoStore = {
  sections: TodoSection[];
  /** Apply a local-only change (no server call). */
  patch: (update: (sections: TodoSection[]) => TodoSection[]) => void;
  /**
   * Apply `update` immediately, then run `action`. On failure the error is
   * surfaced and the tree is resynced from the server rather than rolled
   * back, so overlapping edits can't leave the UI half-reverted.
   */
  run: <T extends Result>(
    update: (sections: TodoSection[]) => TodoSection[],
    action: () => Promise<T>
  ) => Promise<T>;
  /** Surface a short, dismissable message with an optional undo. */
  notify: (notice: Notice) => void;
  /**
   * Mirror an archive decision the server made while handling a task change,
   * and tell the user about it.
   */
  applyArchiveEffect: (effect: ArchiveEffect) => void;
};

const TodoContext = createContext<TodoStore | null>(null);

export function useTodoStore(): TodoStore {
  const store = useContext(TodoContext);
  if (!store) throw new Error("useTodoStore must be used inside TodoProvider");
  return store;
}

export function TodoProvider({
  initialSections,
  children,
}: {
  initialSections: TodoSection[];
  children: ReactNode;
}) {
  const router = useRouter();
  const [sections, setSections] = useState(initialSections);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimer = useRef<number | null>(null);

  const notify = useCallback((next: Notice) => {
    setNotice(next);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 10_000);
  }, []);

  useEffect(
    () => () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    },
    []
  );

  // The server sends a fresh array only when the route actually re-renders
  // (navigation or an explicit refresh), so this resyncs then and stays out
  // of the way during local edits.
  const [lastServerSections, setLastServerSections] = useState(initialSections);
  if (initialSections !== lastServerSections) {
    setLastServerSections(initialSections);
    setSections(initialSections);
  }

  const patch = useCallback(
    (update: (sections: TodoSection[]) => TodoSection[]) => {
      setSections(update);
    },
    []
  );

  const run = useCallback(
    async <T extends Result>(
      update: (sections: TodoSection[]) => TodoSection[],
      action: () => Promise<T>
    ): Promise<T> => {
      setSections(update);
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong");
        router.refresh();
      }
      return result;
    },
    [router]
  );

  const applyArchiveEffect = useCallback(
    (effect: ArchiveEffect) => {
      for (const id of effect.restoredSectionIds) {
        setSections((current) =>
          tree.mapSection(current, id, (s) => ({ ...s, archived_at: null }))
        );
      }
      for (const id of effect.archivedSectionIds) {
        const stamp = new Date().toISOString();
        setSections((current) =>
          tree.mapSection(current, id, (s) => ({ ...s, archived_at: stamp }))
        );
        const name = tree.findSection(sections, id)?.name ?? "That section";
        notify({
          message: `"${name}" is all done — archived.`,
          undo: () => {
            setSections((current) =>
              tree.mapSection(current, id, (s) => ({ ...s, archived_at: null }))
            );
            void setSectionArchived({ sectionId: id, archived: false });
          },
        });
      }
    },
    [notify, sections]
  );

  return (
    <TodoContext.Provider
      value={{ sections, patch, run, notify, applyArchiveEffect }}
    >
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
      {notice && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
          <Archive className="h-4 w-4 shrink-0" />
          <p className="flex-1 text-foreground">{notice.message}</p>
          {notice.undo && (
            <button
              onClick={() => {
                notice.undo?.();
                setNotice(null);
              }}
              className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-accent"
            >
              Undo
            </button>
          )}
          <button
            onClick={() => setNotice(null)}
            className="shrink-0 rounded p-0.5 hover:bg-accent"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {children}
    </TodoContext.Provider>
  );
}
