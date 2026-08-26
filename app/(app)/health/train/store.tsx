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
import type { Session } from "./types";

type Result = { ok: boolean; error?: string };

type SessionStore = {
  session: Session;
  /** Local-only change, no server call. */
  patch: (update: (s: Session) => Session) => void;
  /**
   * Apply `update` immediately, then run `action`. On failure the error is
   * surfaced and the session is resynced from the server rather than rolled
   * back — a half-reverted set list is worse than a moment of staleness.
   */
  run: <T extends Result>(
    update: (s: Session) => Session,
    action: () => Promise<T>
  ) => Promise<T>;
};

const SessionContext = createContext<SessionStore | null>(null);

export function useSessionStore(): SessionStore {
  const store = useContext(SessionContext);
  if (!store)
    throw new Error("useSessionStore must be used inside SessionProvider");
  return store;
}

export function SessionProvider({
  initialSession,
  children,
}: {
  initialSession: Session;
  children: ReactNode;
}) {
  const router = useRouter();
  const [session, setSession] = useState(initialSession);
  const [error, setError] = useState<string | null>(null);

  // The server sends a fresh object only when the route actually re-renders
  // (navigation or an explicit refresh), so this resyncs then and stays out of
  // the way while sets are being typed.
  const [lastServer, setLastServer] = useState(initialSession);
  if (initialSession !== lastServer) {
    setLastServer(initialSession);
    setSession(initialSession);
  }

  const patch = useCallback((update: (s: Session) => Session) => {
    setSession(update);
  }, []);

  const run = useCallback(
    async <T extends Result>(
      update: (s: Session) => Session,
      action: () => Promise<T>
    ): Promise<T> => {
      setSession(update);
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
    <SessionContext.Provider value={{ session, patch, run }}>
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
    </SessionContext.Provider>
  );
}
