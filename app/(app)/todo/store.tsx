"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, X } from "lucide-react";
import type { TodoSection } from "./types";

type Result = { ok: boolean; error?: string };

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

  return (
    <TodoContext.Provider value={{ sections, patch, run }}>
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
      {children}
    </TodoContext.Provider>
  );
}
