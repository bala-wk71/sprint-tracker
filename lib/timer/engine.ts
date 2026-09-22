import { format } from "date-fns";

/**
 * Focus timer state machine.
 *
 * Everything here is pure: the provider feeds in `Date.now()` and persists
 * whatever comes back. A running phase is stored as an absolute `endsAt`
 * rather than a countdown, so a timer that nobody was watching — closed tab,
 * sleeping laptop — is simply caught up by `advance` the next time it's read.
 */

export type TimerMode = "pomodoro" | "timer";
export type Phase = "focus" | "short" | "long";

export type TimerSettings = {
  focusMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  longBreakEvery: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  sound: boolean;
  dailyTargetHours: number;
  countBreaks: boolean;
  /** Last length used in single-timer mode. */
  timerMin: number;
};

export type Run = {
  id: string;
  mode: TimerMode;
  phase: Phase;
  status: "running" | "paused" | "ready";
  durationMs: number;
  /** When this phase was first started; 0 while `ready`. */
  startedAt: number;
  /** Set only while running. */
  endsAt: number | null;
  /** Time left when paused or ready. */
  remainingMs: number;
  taskId: string | null;
  taskName: string | null;
  notes: string;
  /** Focus sessions finished in the current set, before the long break. */
  cycle: number;
};

export type PendingLog = {
  id: string;
  date: string;
  startTime: string;
  minutes: number;
  taskId: string | null;
  notes: string;
};

export type DayStats = {
  focusSessions: number;
  focusMinutes: number;
  breakMinutes: number;
};

export type Completion = {
  phase: Phase;
  mode: TimerMode;
  minutes: number;
  at: number;
  taskName: string | null;
};

export type TimerState = {
  v: 1;
  settings: TimerSettings;
  run: Run | null;
  pending: PendingLog[];
  days: Record<string, DayStats>;
  last: Completion | null;
};

export const DEFAULT_SETTINGS: TimerSettings = {
  focusMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  longBreakEvery: 4,
  autoStartBreaks: true,
  autoStartFocus: false,
  sound: true,
  dailyTargetHours: 8,
  countBreaks: false,
  timerMin: 30,
};

export const INITIAL_STATE: TimerState = {
  v: 1,
  settings: DEFAULT_SETTINGS,
  run: null,
  pending: [],
  days: {},
  last: null,
};

const MIN = 60_000;

/**
 * How late a phase end can be processed and still auto-start a focus session.
 * Past this, nobody was watching when the break ended, and chaining on would
 * log work that never happened.
 */
export const UNATTENDED_MS = 60_000;

export const PHASE_LABEL: Record<Phase, string> = {
  focus: "Focus",
  short: "Short break",
  long: "Long break",
};

/** What a run is called in the title and header: a plain timer isn't a "Focus" phase. */
export function runLabel(run: Pick<Run, "mode" | "phase">): string {
  return run.mode === "timer" ? "Timer" : PHASE_LABEL[run.phase];
}

export function localDate(ms: number): string {
  return format(new Date(ms), "yyyy-MM-dd");
}

export function localTime(ms: number): string {
  return format(new Date(ms), "HH:mm");
}

let idCounter = 0;
function newId(now: number): string {
  idCounter = (idCounter + 1) % 1_000_000;
  return `${now.toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function phaseMinutes(settings: TimerSettings, phase: Phase): number {
  if (phase === "focus") return settings.focusMin;
  if (phase === "short") return settings.shortBreakMin;
  return settings.longBreakMin;
}

/** Remaining time of a run at `now`, never negative. */
export function remainingMs(run: Run, now: number): number {
  if (run.status === "running" && run.endsAt !== null) {
    return Math.max(0, run.endsAt - now);
  }
  return run.remainingMs;
}

export function startSession(
  state: TimerState,
  opts: {
    mode: TimerMode;
    minutes?: number;
    taskId: string | null;
    taskName: string | null;
    notes: string;
  },
  now: number
): TimerState {
  const minutes =
    opts.mode === "timer"
      ? clampMinutes(opts.minutes ?? state.settings.timerMin)
      : state.settings.focusMin;
  const durationMs = minutes * MIN;
  const settings =
    opts.mode === "timer" ? { ...state.settings, timerMin: minutes } : state.settings;
  return {
    ...state,
    settings,
    run: {
      id: newId(now),
      mode: opts.mode,
      phase: "focus",
      status: "running",
      durationMs,
      startedAt: now,
      endsAt: now + durationMs,
      remainingMs: durationMs,
      taskId: opts.taskId,
      taskName: opts.taskName,
      notes: opts.notes,
      // A start from idle is a fresh set; the queued focus after a break goes
      // through startReady and keeps its count.
      cycle: 0,
    },
  };
}

/** Start a phase that is waiting (`ready`) — typically the next focus. */
export function startReady(
  state: TimerState,
  now: number,
  patch?: Partial<Pick<Run, "taskId" | "taskName" | "notes">>
): TimerState {
  const run = state.run;
  if (!run || run.status !== "ready") return state;
  return {
    ...state,
    run: {
      ...run,
      ...patch,
      status: "running",
      startedAt: now,
      endsAt: now + run.remainingMs,
    },
  };
}

export function pause(state: TimerState, now: number): TimerState {
  const run = state.run;
  if (!run || run.status !== "running") return state;
  return {
    ...state,
    run: { ...run, status: "paused", endsAt: null, remainingMs: remainingMs(run, now) },
  };
}

export function resume(state: TimerState, now: number): TimerState {
  const run = state.run;
  if (!run || run.status !== "paused") return state;
  return {
    ...state,
    run: { ...run, status: "running", endsAt: now + run.remainingMs },
  };
}

/** Throw away the current phase without logging anything. */
export function reset(state: TimerState): TimerState {
  return { ...state, run: null };
}

/** Change what the running session will be logged against. */
export function updateTask(
  state: TimerState,
  patch: Partial<Pick<Run, "taskId" | "taskName" | "notes">>
): TimerState {
  if (!state.run) return state;
  return { ...state, run: { ...state.run, ...patch } };
}

/**
 * End the current phase now, counting the time actually spent. A focus
 * session logs its elapsed minutes; a break just moves on to focus.
 */
export function finishNow(
  state: TimerState,
  now: number
): { state: TimerState; completion: Completion | null } {
  const run = state.run;
  if (!run || run.status === "ready") {
    // Skipping a queued break goes straight to the focus that follows it.
    if (run && run.status === "ready" && run.phase !== "focus") {
      return { state: { ...state, run: nextRun(state, run, now, false) }, completion: null };
    }
    return { state, completion: null };
  }
  const elapsed = run.durationMs - remainingMs(run, now);
  return complete(state, run, now, elapsed, true);
}

/**
 * Catch the timer up to `now`, completing every phase whose end has passed.
 * Auto-started phases chain from the previous phase's end time, not from
 * `now`, so the timeline stays true even when processed late.
 */
export function advance(
  state: TimerState,
  now: number
): { state: TimerState; completions: Completion[] } {
  const completions: Completion[] = [];
  let current = state;
  for (let i = 0; i < 100; i++) {
    const run = current.run;
    if (!run || run.status !== "running" || run.endsAt === null || now < run.endsAt) break;
    const endAt = run.endsAt;
    const attended = now - endAt < UNATTENDED_MS;
    const result = complete(current, run, endAt, run.durationMs, attended);
    current = result.state;
    if (result.completion) completions.push(result.completion);
  }
  return { state: current, completions };
}

function complete(
  state: TimerState,
  run: Run,
  endAt: number,
  elapsedMs: number,
  attended: boolean
): { state: TimerState; completion: Completion | null } {
  const minutes = Math.round(elapsedMs / MIN);
  // Stats and logs belong to the day the phase started on.
  const date = localDate(run.startedAt || endAt);
  const day = state.days[date] ?? { focusSessions: 0, focusMinutes: 0, breakMinutes: 0 };
  let pending = state.pending;
  let days = state.days;

  if (run.phase === "focus") {
    if (minutes >= 1) {
      pending = pending.some((p) => p.id === run.id)
        ? pending
        : [
            ...pending,
            {
              id: run.id,
              date,
              startTime: localTime(run.startedAt),
              minutes,
              taskId: run.taskId,
              notes: run.notes,
            },
          ];
    }
    days = {
      ...days,
      [date]: {
        ...day,
        focusSessions: day.focusSessions + (minutes >= 1 ? 1 : 0),
        focusMinutes: day.focusMinutes + minutes,
      },
    };
  } else {
    days = { ...days, [date]: { ...day, breakMinutes: day.breakMinutes + minutes } };
  }

  const completion: Completion = {
    phase: run.phase,
    mode: run.mode,
    minutes,
    at: endAt,
    taskName: run.taskName,
  };
  const next = { ...state, pending, days: pruneDays(days, endAt), last: completion };
  return { state: { ...next, run: nextRun(next, run, endAt, attended) }, completion };
}

function nextRun(state: TimerState, run: Run, endAt: number, attended: boolean): Run | null {
  if (run.mode === "timer") return null;
  const { settings } = state;

  let phase: Phase;
  let cycle = run.cycle;
  if (run.phase === "focus") {
    cycle = run.cycle + 1;
    phase = cycle >= settings.longBreakEvery ? "long" : "short";
  } else {
    phase = "focus";
    if (run.phase === "long") cycle = 0;
  }

  const autoStart =
    phase === "focus" ? settings.autoStartFocus && attended : settings.autoStartBreaks;
  const durationMs = phaseMinutes(settings, phase) * MIN;

  return {
    ...run,
    id: newId(endAt),
    phase,
    cycle,
    durationMs,
    remainingMs: durationMs,
    status: autoStart ? "running" : "ready",
    startedAt: autoStart ? endAt : 0,
    endsAt: autoStart ? endAt + durationMs : null,
  };
}

/** Drop a log once the server has it. */
export function removePending(state: TimerState, id: string): TimerState {
  return { ...state, pending: state.pending.filter((p) => p.id !== id) };
}

export function updateSettings(state: TimerState, patch: Partial<TimerSettings>): TimerState {
  const settings = sanitizeSettings({ ...state.settings, ...patch });
  // A waiting phase picks up a new length straight away; a running one keeps
  // the length it was started with.
  const run = state.run;
  if (run && run.status === "ready" && run.mode === "pomodoro") {
    const durationMs = phaseMinutes(settings, run.phase) * MIN;
    return { ...state, settings, run: { ...run, durationMs, remainingMs: durationMs } };
  }
  return { ...state, settings };
}

function clampMinutes(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(600, Math.max(1, Math.round(n)));
}

export function sanitizeSettings(s: Partial<TimerSettings>): TimerSettings {
  const d = DEFAULT_SETTINGS;
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
  return {
    focusMin: clampMinutes(num(s.focusMin, d.focusMin)),
    shortBreakMin: clampMinutes(num(s.shortBreakMin, d.shortBreakMin)),
    longBreakMin: clampMinutes(num(s.longBreakMin, d.longBreakMin)),
    longBreakEvery: Math.min(12, Math.max(1, Math.round(num(s.longBreakEvery, d.longBreakEvery)))),
    autoStartBreaks: bool(s.autoStartBreaks, d.autoStartBreaks),
    autoStartFocus: bool(s.autoStartFocus, d.autoStartFocus),
    sound: bool(s.sound, d.sound),
    dailyTargetHours: Math.min(24, Math.max(0.5, num(s.dailyTargetHours, d.dailyTargetHours))),
    countBreaks: bool(s.countBreaks, d.countBreaks),
    timerMin: clampMinutes(num(s.timerMin, d.timerMin)),
  };
}

/** Keep two weeks of daily stats; older days are never shown. */
function pruneDays(days: Record<string, DayStats>, now: number): Record<string, DayStats> {
  const cutoff = localDate(now - 14 * 24 * 60 * MIN);
  const keys = Object.keys(days);
  if (keys.every((k) => k >= cutoff)) return days;
  return Object.fromEntries(keys.filter((k) => k >= cutoff).map((k) => [k, days[k]]));
}

/** Parse whatever is in storage, falling back to a fresh state. */
export function parseState(raw: string | null): TimerState {
  if (!raw) return INITIAL_STATE;
  try {
    const data = JSON.parse(raw) as Partial<TimerState>;
    if (data?.v !== 1) return INITIAL_STATE;
    return {
      v: 1,
      settings: sanitizeSettings(data.settings ?? {}),
      run: data.run && typeof data.run === "object" ? data.run : null,
      pending: Array.isArray(data.pending) ? data.pending : [],
      days: data.days && typeof data.days === "object" ? data.days : {},
      last: data.last ?? null,
    };
  } catch {
    return INITIAL_STATE;
  }
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
