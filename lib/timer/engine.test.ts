import { describe, expect, it } from "vitest";
import {
  INITIAL_STATE,
  advance,
  finishNow,
  formatClock,
  parseState,
  pause,
  remainingMs,
  resume,
  startReady,
  startSession,
  updateSettings,
  type TimerState,
} from "./engine";

const MIN = 60_000;
// 09:00 local time, so logged start times read naturally.
const T0 = new Date(2026, 8, 22, 9, 0, 0).getTime();

const task = { taskId: "t1", taskName: "Write report", notes: "draft" };

function pomodoro(state: TimerState = INITIAL_STATE, now = T0) {
  return startSession(state, { mode: "pomodoro", ...task }, now);
}

describe("pomodoro cycle", () => {
  it("logs a finished focus session and auto-starts the short break", () => {
    const { state, completions } = advance(pomodoro(), T0 + 25 * MIN);
    expect(completions.map((c) => c.phase)).toEqual(["focus"]);
    expect(state.pending).toEqual([
      expect.objectContaining({ date: "2026-09-22", startTime: "09:00", minutes: 25, taskId: "t1", notes: "draft" }),
    ]);
    expect(state.run).toMatchObject({ phase: "short", status: "running", startedAt: T0 + 25 * MIN, cycle: 1 });
    expect(state.days["2026-09-22"]).toEqual({ focusSessions: 1, focusMinutes: 25, breakMinutes: 0 });
  });

  it("waits for you after a break by default", () => {
    const { state } = advance(pomodoro(), T0 + 30 * MIN);
    expect(state.run).toMatchObject({ phase: "focus", status: "ready", remainingMs: 25 * MIN, cycle: 1 });
    expect(state.days["2026-09-22"].breakMinutes).toBe(5);
    const started = startReady(state, T0 + 40 * MIN);
    expect(started.run).toMatchObject({ status: "running", startedAt: T0 + 40 * MIN, endsAt: T0 + 65 * MIN });
  });

  it("takes a long break after every fourth session", () => {
    let s = updateSettings(INITIAL_STATE, { autoStartFocus: true });
    s = pomodoro(s);
    // Walk it live, one phase at a time, as a watching tab would.
    const phases: string[] = [];
    let now = T0;
    for (let i = 0; i < 8; i++) {
      now = s.run!.endsAt!;
      const r = advance(s, now);
      s = r.state;
      phases.push(s.run!.phase);
    }
    expect(phases).toEqual(["short", "focus", "short", "focus", "short", "focus", "long", "focus"]);
    expect(s.run!.cycle).toBe(0);
    expect(s.pending).toHaveLength(4);
  });

  it("never auto-starts focus for a timer nobody was watching", () => {
    const s = updateSettings(pomodoro(), { autoStartFocus: true });
    // Laptop closed for three hours.
    const { state, completions } = advance(s, T0 + 180 * MIN);
    expect(completions.map((c) => c.phase)).toEqual(["focus", "short"]);
    expect(state.run).toMatchObject({ phase: "focus", status: "ready" });
    expect(state.pending).toHaveLength(1);
  });
});

describe("pause and finish", () => {
  it("freezes the clock while paused", () => {
    let s = pause(pomodoro(), T0 + 10 * MIN);
    expect(remainingMs(s.run!, T0 + 50 * MIN)).toBe(15 * MIN);
    expect(advance(s, T0 + 50 * MIN).completions).toHaveLength(0);
    s = resume(s, T0 + 50 * MIN);
    expect(s.run!.endsAt).toBe(T0 + 65 * MIN);
  });

  it("logs only the minutes worked when finishing early", () => {
    const { state, completion } = finishNow(pomodoro(), T0 + 12 * MIN + 20_000);
    expect(completion).toMatchObject({ phase: "focus", minutes: 12 });
    expect(state.pending[0].minutes).toBe(12);
    expect(state.run!.phase).toBe("short");
  });

  it("logs nothing for a session under a minute", () => {
    const { state } = finishNow(pomodoro(), T0 + 20_000);
    expect(state.pending).toHaveLength(0);
  });

  it("skips a queued break straight to focus", () => {
    const s = updateSettings(INITIAL_STATE, { autoStartBreaks: false });
    const afterFocus = advance(pomodoro(s), T0 + 25 * MIN).state;
    expect(afterFocus.run).toMatchObject({ phase: "short", status: "ready" });
    const skipped = finishNow(afterFocus, T0 + 26 * MIN).state;
    expect(skipped.run).toMatchObject({ phase: "focus", status: "ready" });
    expect(skipped.days["2026-09-22"].breakMinutes).toBe(0);
  });
});

describe("single timer", () => {
  it("counts down once, logs, and stops", () => {
    const s = startSession(INITIAL_STATE, { mode: "timer", minutes: 50, ...task }, T0);
    expect(s.settings.timerMin).toBe(50);
    const { state } = advance(s, T0 + 51 * MIN);
    expect(state.run).toBeNull();
    expect(state.pending[0]).toMatchObject({ minutes: 50, startTime: "09:00" });
  });
});

describe("storage", () => {
  it("round-trips and ignores junk", () => {
    const s = pomodoro();
    expect(parseState(JSON.stringify(s))).toEqual(s);
    expect(parseState("{nope")).toEqual(INITIAL_STATE);
    expect(parseState(JSON.stringify({ v: 1, settings: { focusMin: -3 } })).settings.focusMin).toBe(1);
  });

  it("fills in alarm settings saved before they existed", () => {
    const old = parseState(JSON.stringify({ v: 1, settings: { sound: true, volume: 7, soundKind: "siren" } }));
    expect(old.settings).toMatchObject({ soundKind: "alarm", volume: 1, keepRinging: true });
  });

  it("formats the clock", () => {
    expect(formatClock(25 * MIN)).toBe("25:00");
    expect(formatClock(59_001)).toBe("1:00");
    expect(formatClock(90 * MIN)).toBe("1:30:00");
  });
});
