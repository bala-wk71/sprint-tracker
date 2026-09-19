// "What moved it": compares the weeks an action was kept with the weeks it
// wasn't, using the measure's own change in each week. Computed before any AI
// writes a word, so a report explains numbers rather than inventing them.
// Pure and client-safe.

import { addDaysIso } from "@/lib/week";
import { latestOnOrBefore, type Direction, type Point } from "./projection";

/** Weeks needed on each side before a comparison means anything. */
export const MIN_WEEKS_EACH_SIDE = 2;

/** The measure's change over each week, or null when a week has no reading near either end. */
export function weeklyChanges(points: Point[], weekStarts: string[]): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const start of weekStarts) {
    const before = latestOnOrBefore(points, addDaysIso(start, -1));
    const after = latestOnOrBefore(points, addDaysIso(start, 6));
    // A reading more than a week stale at either end says nothing about this week.
    const fresh =
      before && after && after.date >= start && before.date >= addDaysIso(start, -7) && after.date !== before.date;
    out.set(start, fresh ? after.value - before.value : null);
  }
  return out;
}

export type MovedIt = {
  leverId: string;
  leverTitle: string;
  target: number;
  keptWeeks: number;
  /** Average change per week when the action hit its target (signed, in the measure's unit). */
  keptChange: number;
  otherWeeks: number;
  otherChange: number;
  /** How much better kept weeks were, in the good direction. Always > 0. */
  gain: number;
};

/**
 * Levers whose kept weeks moved the measure more in the good direction than
 * the other weeks did, best first. A lever that shows no gain is left out:
 * the report says what helps, not what didn't seem to.
 */
export function whatMovedIt(
  changes: Map<string, number | null>,
  direction: Direction,
  levers: { id: string; title: string; target: number; byWeek: Map<string, number> }[]
): MovedIt[] {
  if (direction === "band") return [];
  const s = direction === "down" ? -1 : 1;
  const results: MovedIt[] = [];
  for (const lever of levers) {
    const kept: number[] = [];
    const other: number[] = [];
    for (const [week, change] of changes) {
      // A week missing from byWeek is one before the action existed: not a missed week.
      const done = lever.byWeek.get(week);
      if (change === null || done === undefined) continue;
      (done >= lever.target ? kept : other).push(change);
    }
    if (kept.length < MIN_WEEKS_EACH_SIDE || other.length < MIN_WEEKS_EACH_SIDE) continue;
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const keptChange = avg(kept);
    const otherChange = avg(other);
    const gain = (keptChange - otherChange) * s;
    if (gain <= 0) continue;
    results.push({
      leverId: lever.id,
      leverTitle: lever.title,
      target: lever.target,
      keptWeeks: kept.length,
      keptChange,
      otherWeeks: other.length,
      otherChange,
      gain,
    });
  }
  return results.sort((a, b) => b.gain - a.gain);
}

/**
 * Change over the last four weeks against the four before, in the good
 * direction: "improving" is measured against your own recent self.
 */
export function recentChange(points: Point[], asOfIso: string): { last4: number; prev4: number } | null {
  const now = latestOnOrBefore(points, asOfIso);
  const mid = latestOnOrBefore(points, addDaysIso(asOfIso, -28));
  const old = latestOnOrBefore(points, addDaysIso(asOfIso, -56));
  if (!now || !mid || !old) return null;
  if (mid.date < addDaysIso(asOfIso, -35) || old.date < addDaysIso(asOfIso, -63) || mid.date === old.date) return null;
  return { last4: now.value - mid.value, prev4: mid.value - old.value };
}
