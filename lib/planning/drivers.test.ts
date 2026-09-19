import { describe, expect, it } from "vitest";
import { recentChange, weeklyChanges, whatMovedIt } from "./drivers";
import { addDaysIso } from "@/lib/week";
import type { Point } from "./projection";

const weeks = Array.from({ length: 8 }, (_, i) => addDaysIso("2026-07-27", i * 7)); // Mondays
// Strength sessions per week: 4 in the even weeks, 2 in the odd ones.
const sessions = new Map(weeks.map((w, i) => [w, i % 2 === 0 ? 4 : 2]));

/** Daily weight that drops 0.8 kg in 4-session weeks and 0.2 kg in the others. */
function weight(): Point[] {
  const points: Point[] = [{ date: addDaysIso(weeks[0], -1), value: 95 }];
  let value = 95;
  for (const w of weeks) {
    const perDay = (sessions.get(w) === 4 ? -0.8 : -0.2) / 7;
    for (let d = 0; d < 7; d++) {
      value += perDay;
      points.push({ date: addDaysIso(w, d), value });
    }
  }
  return points;
}

describe("weeklyChanges", () => {
  it("reads each week's change end to end", () => {
    const changes = weeklyChanges(weight(), weeks);
    expect(changes.get(weeks[0])).toBeCloseTo(-0.8, 5);
    expect(changes.get(weeks[1])).toBeCloseTo(-0.2, 5);
  });

  it("gives null for a week with no fresh readings", () => {
    const changes = weeklyChanges([{ date: "2026-07-01", value: 95 }, { date: "2026-08-20", value: 93 }], ["2026-07-27"]);
    expect(changes.get("2026-07-27")).toBeNull();
  });
});

describe("whatMovedIt", () => {
  it("compares kept weeks with the rest, like the design's example", () => {
    const [moved] = whatMovedIt(weeklyChanges(weight(), weeks), "down", [
      { id: "l1", title: "Strength sessions", target: 4, byWeek: sessions },
    ]);
    expect(moved.keptWeeks).toBe(4);
    expect(moved.keptChange).toBeCloseTo(-0.8, 5);
    expect(moved.otherChange).toBeCloseTo(-0.2, 5);
    expect(moved.gain).toBeCloseTo(0.6, 5);
  });

  it("leaves out a lever with no gain or too few weeks on one side", () => {
    const always = new Map(weeks.map((w) => [w, 5]));
    const backwards = new Map(weeks.map((w, i) => [w, i % 2 === 0 ? 0 : 3]));
    const result = whatMovedIt(weeklyChanges(weight(), weeks), "down", [
      { id: "a", title: "Every week", target: 4, byWeek: always },
      { id: "b", title: "Only in slow weeks", target: 3, byWeek: backwards },
    ]);
    expect(result).toEqual([]);
  });
});

describe("recentChange", () => {
  it("compares the last four weeks with the four before", () => {
    const points = Array.from({ length: 60 }, (_, i) => ({ date: addDaysIso("2026-07-22", i), value: 95 - (i < 32 ? 0.01 : 0.05) * i }));
    const r = recentChange(points, "2026-09-19")!;
    expect(r.last4).toBeLessThan(r.prev4);
  });

  it("is null without eight weeks of readings", () => {
    expect(recentChange([{ date: "2026-09-01", value: 90 }], "2026-09-19")).toBeNull();
  });
});
