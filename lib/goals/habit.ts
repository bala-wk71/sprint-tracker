// A Habit goal read week by week: each week since it started either kept
// (reached the minimum) or not, and the week in progress never counts against
// it. Pure and client-safe.

import { addDaysIso, weekStartIsoOf, type WeekStartDay } from "@/lib/week";

export type HabitWeek = {
  start: string;
  done: number;
  /** Reached the minimum for a hard week. */
  kept: boolean;
  /** Reached the full target. */
  hit: boolean;
  current: boolean;
};

export type HabitRead = {
  /** Weeks so far, oldest first, ending with the current one. */
  weeks: HabitWeek[];
  thisWeek: number;
  target: number;
  floor: number;
  /** Weeks kept, counting this week once it reaches the minimum. */
  kept: number;
  /** Every week from the goal's start to its end. */
  total: number;
  /** Kept weeks in a row up to now; this week joins once it's kept. */
  streak: number;
};

export function readHabit(
  daily: Map<string, number> | undefined,
  o: { startIso: string; endIso: string; todayIso: string; weekStartDay: WeekStartDay; target: number; floor: number }
): HabitRead {
  const first = weekStartIsoOf(o.startIso, o.weekStartDay);
  const last = weekStartIsoOf(o.endIso, o.weekStartDay);
  const currentStart = weekStartIsoOf(o.todayIso, o.weekStartDay);
  const upTo = currentStart < last ? currentStart : last;
  // The minimum is what keeps a week; a minimum of 0 would keep every week.
  const keepAt = Math.max(o.floor, Math.min(1, o.target));

  const weeks: HabitWeek[] = [];
  for (let start = first; start <= upTo && weeks.length < 600; start = addDaysIso(start, 7)) {
    const end = addDaysIso(start, 6);
    let done = 0;
    for (const [date, n] of daily ?? []) if (date >= start && date <= end) done += n;
    done = Math.round(done * 10) / 10;
    weeks.push({ start, done, kept: done >= keepAt, hit: done >= o.target, current: start === currentStart });
  }

  let total = 0;
  for (let start = first; start <= last && total < 600; start = addDaysIso(start, 7)) total++;

  let streak = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    const w = weeks[i];
    if (w.kept) streak++;
    else if (!w.current) break;
  }

  return {
    weeks,
    thisWeek: weeks.find((w) => w.current)?.done ?? 0,
    target: o.target,
    floor: o.floor,
    kept: weeks.filter((w) => w.kept).length,
    total,
    streak,
  };
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** "2 of 4 this week · 3 of 10 weeks kept". */
export function habitLine(h: HabitRead, unit = ""): string {
  const week = `${fmt(h.thisWeek)}${unit} of ${fmt(h.target)}${unit} this week`;
  const kept = `${h.kept} of ${h.total} ${h.total === 1 ? "week" : "weeks"} kept`;
  return `${week} · ${kept}`;
}
