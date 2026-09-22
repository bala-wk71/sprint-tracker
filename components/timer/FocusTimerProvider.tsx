"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { addTimeEntry } from "@/app/(app)/daily/actions";
import {
  INITIAL_STATE,
  PHASE_LABEL,
  advance,
  finishNow,
  formatClock,
  parseState,
  pause,
  remainingMs,
  removePending,
  reset,
  resume,
  startReady,
  startSession,
  updateSettings,
  updateTask,
  type Completion,
  type PendingLog,
  type Run,
  type TimerMode,
  type TimerSettings,
  type TimerState,
} from "@/lib/timer/engine";

const KEY = "sprint-tracker:focus-timer:v1";
const RETRY_MS = 30_000;

// ----------------------------------------------------------------------
// Storage. localStorage is the source of truth so every tab — and the tab
// you reopen tomorrow — sees the same timer. Falls back to memory when
// storage is blocked (private mode), which still works for this tab.
// ----------------------------------------------------------------------

let memoryRaw: string | null = null;
let cachedRaw: string | null | undefined;
let cachedState: TimerState = INITIAL_STATE;
const listeners = new Set<() => void>();

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return memoryRaw;
  }
}

function writeState(state: TimerState) {
  const raw = JSON.stringify(state);
  memoryRaw = raw;
  try {
    window.localStorage.setItem(KEY, raw);
  } catch {
    // Memory copy above keeps this tab working.
  }
  cachedRaw = raw;
  cachedState = state;
  listeners.forEach((l) => l());
}

function readState(): TimerState {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedState = parseState(raw);
  }
  return cachedState;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Run `fn` holding a cross-tab lock, so two open tabs can't both complete
 * the same phase or post the same session. State is re-read inside the lock.
 */
async function withLock<T>(fn: () => Promise<T> | T): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (locks?.request) {
    return locks.request(KEY, async () => fn()) as Promise<T>;
  }
  return fn();
}

function mutate<T = void>(
  fn: (state: TimerState, now: number) => { state: TimerState; result?: T } | TimerState
): Promise<T | undefined> {
  return withLock(() => {
    const current = readState();
    const out = fn(current, Date.now());
    if ("v" in out) {
      if (out !== current) writeState(out);
      return undefined;
    }
    if (out.state !== current) writeState(out.state);
    return out.result;
  });
}

// ----------------------------------------------------------------------
// Alerts
// ----------------------------------------------------------------------

let audioCtx: AudioContext | null = null;

/** Browsers only allow sound after a user gesture — call from click handlers. */
function primeAudio() {
  try {
    if (!audioCtx) {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    void audioCtx?.resume();
  } catch {
    audioCtx = null;
  }
}

function chime() {
  const ctx = audioCtx;
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    [880, 660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = t + i * 0.28;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.26);
    });
  } catch {
    // Sound is a nicety; the notification and the on-screen state still land.
  }
}

function describe(c: Completion, next: Run | null): { title: string; body: string } {
  if (c.phase === "focus") {
    const title = c.mode === "timer" ? "Time's up" : "Focus session done";
    const logged = c.minutes >= 1 ? `${c.minutes} min logged${c.taskName ? ` to ${c.taskName}` : ""}.` : "";
    const then = next
      ? next.status === "running"
        ? ` ${PHASE_LABEL[next.phase]} started.`
        : ` Time for a ${PHASE_LABEL[next.phase].toLowerCase()}.`
      : "";
    return { title, body: `${logged}${then}`.trim() };
  }
  return {
    title: "Break's over",
    body: next?.status === "running" ? "Next focus session started." : "Ready for the next focus session?",
  };
}

async function notify(title: string, body: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const options: NotificationOptions = { body, tag: "focus-timer", icon: "/favicon.ico" };
  try {
    const reg = await navigator.serviceWorker?.getRegistration("/timer-sw.js");
    if (reg) {
      await reg.showNotification(title, options);
      return;
    }
  } catch {
    // Fall through to a page notification.
  }
  try {
    new Notification(title, options);
  } catch {
    // Some mobile browsers only allow service-worker notifications.
  }
}

// ----------------------------------------------------------------------
// Context
// ----------------------------------------------------------------------

type StartOpts = {
  mode: TimerMode;
  minutes?: number;
  taskId: string | null;
  taskName: string | null;
  notes: string;
};

type FocusTimerContextValue = {
  state: TimerState;
  now: number;
  hydrated: boolean;
  remaining: number;
  start: (opts: StartOpts) => void;
  startNext: (patch?: Partial<Pick<Run, "taskId" | "taskName" | "notes">>) => void;
  pause: () => void;
  resume: () => void;
  finish: () => void;
  reset: () => void;
  setTask: (patch: Partial<Pick<Run, "taskId" | "taskName" | "notes">>) => void;
  setSettings: (patch: Partial<TimerSettings>) => void;
  dismissLast: () => void;
  notifyPermission: NotificationPermission | "unsupported";
  requestNotifications: () => void;
  logError: string | null;
  retryLogs: () => void;
};

const FocusTimerContext = createContext<FocusTimerContextValue | null>(null);

export function useFocusTimer(): FocusTimerContextValue {
  const ctx = useContext(FocusTimerContext);
  if (!ctx) throw new Error("useFocusTimer must be used inside FocusTimerProvider");
  return ctx;
}

const noopSubscribe = () => () => {};

export function FocusTimerProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const state = useSyncExternalStore(subscribe, readState, () => INITIAL_STATE);
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [now, setNow] = useState(() => Date.now());
  const [logError, setLogError] = useState<string | null>(null);
  const [retryAt, setRetryAt] = useState(0);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "default"
  );
  const flushing = useRef(false);
  const soundOn = state.settings.sound;

  // Notification permission is only knowable in the browser.
  useEffect(() => {
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/timer-sw.js").catch(() => {});
    }
  }, []);

  const handleCompletions = useCallback(
    (completions: Completion[], next: Run | null) => {
      if (completions.length === 0) return;
      const last = completions[completions.length - 1];
      const { title, body } = describe(last, next);
      if (soundOn) chime();
      try {
        navigator.vibrate?.([200, 100, 200]);
      } catch {
        // Not every browser exposes vibrate.
      }
      void notify(title, body);
    },
    [soundOn]
  );

  // Complete any phase whose time has come. Only the tab that wins the lock
  // sees the completions, so the alert fires once, not once per tab.
  const tick = useCallback(() => {
    const t = Date.now();
    setNow(t);
    const run = readState().run;
    if (!run || run.status !== "running" || run.endsAt === null || t < run.endsAt) return;
    void mutate<{ completions: Completion[]; next: Run | null }>((s, n) => {
      const r = advance(s, n);
      return { state: r.state, result: { completions: r.completions, next: r.state.run } };
    }).then((res) => {
      if (res) handleCompletions(res.completions, res.next);
    });
  }, [handleCompletions]);

  const running = state.run?.status === "running";
  useEffect(() => {
    tick();
    if (!running) return;
    const id = window.setInterval(tick, 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [running, tick]);

  // Post finished focus sessions as time entries.
  const pendingCount = state.pending.length;
  useEffect(() => {
    if (pendingCount === 0 || flushing.current) return;
    const wait = Math.max(0, retryAt - Date.now());
    const handle = window.setTimeout(() => {
      flushing.current = true;
      void withLock(async () => {
        let posted = 0;
        for (;;) {
          const next: PendingLog | undefined = readState().pending[0];
          if (!next) break;
          const error = await postLog(next);
          if (error) {
            setLogError(error);
            setRetryAt(Date.now() + RETRY_MS);
            break;
          }
          writeState(removePending(readState(), next.id));
          posted++;
        }
        if (posted > 0) {
          setLogError(null);
          router.refresh();
        }
      }).finally(() => {
        flushing.current = false;
      });
    }, wait);
    return () => window.clearTimeout(handle);
  }, [pendingCount, retryAt, router]);

  // Keep the countdown in the tab title while a phase runs.
  const baseTitle = useRef<string | null>(null);
  const remaining = state.run ? remainingMs(state.run, now) : 0;
  const titleText =
    state.run && state.run.status !== "ready"
      ? `${state.run.status === "paused" ? "Paused " : ""}${formatClock(remaining)} · ${PHASE_LABEL[state.run.phase]}`
      : null;
  useEffect(() => {
    if (titleText) {
      if (baseTitle.current === null) baseTitle.current = document.title;
      document.title = titleText;
    } else if (baseTitle.current !== null) {
      document.title = baseTitle.current;
      baseTitle.current = null;
    }
  }, [titleText]);

  const value = useMemo<FocusTimerContextValue>(
    () => ({
      state,
      now,
      hydrated,
      remaining,
      start: (opts) => {
        primeAudio();
        void mutate((s, n) => startSession(s, opts, n));
      },
      startNext: (patch) => {
        primeAudio();
        void mutate((s, n) => startReady(s, n, patch));
      },
      pause: () => void mutate((s, n) => pause(s, n)),
      resume: () => {
        primeAudio();
        void mutate((s, n) => resume(s, n));
      },
      finish: () => {
        primeAudio();
        void mutate((s, n) => finishNow(s, n).state);
      },
      reset: () => void mutate((s) => reset(s)),
      setTask: (patch) => void mutate((s) => updateTask(s, patch)),
      setSettings: (patch) => void mutate((s) => updateSettings(s, patch)),
      dismissLast: () => void mutate((s) => ({ ...s, last: null })),
      notifyPermission: permission,
      requestNotifications: () => {
        primeAudio();
        if (typeof Notification === "undefined") return;
        void Notification.requestPermission().then(setPermission);
      },
      logError,
      retryLogs: () => {
        setLogError(null);
        setRetryAt(0);
      },
    }),
    [state, now, hydrated, remaining, permission, logError]
  );

  return <FocusTimerContext.Provider value={value}>{children}</FocusTimerContext.Provider>;
}

async function postLog(log: PendingLog): Promise<string | null> {
  const input = {
    date: log.date,
    task_id: log.taskId,
    start_time: log.startTime,
    duration_hours: Math.max(0.01, Math.round((log.minutes / 60) * 100) / 100),
    energy_during: null,
    notes: log.notes.trim() || "Focus session",
    is_private: false,
  };
  try {
    let result = await addTimeEntry(input);
    // The task may have been deleted while the timer ran — keep the hours.
    if (!result.ok && log.taskId && /foreign key|violates/i.test(result.error)) {
      result = await addTimeEntry({ ...input, task_id: null });
    }
    return result.ok ? null : result.error;
  } catch (e) {
    return e instanceof Error ? e.message : "Couldn't reach the server";
  }
}
