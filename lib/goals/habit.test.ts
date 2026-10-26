import { describe, expect, it } from "vitest";
import { habitLine, readHabit } from "./habit";

const days = (entries: [string, number][]) => new Map(entries);
// Mondays: 2026-10-05, 10-12, 10-19, 10-26.
const base = { startIso: "2026-10-07", endIso: "2026-12-31", weekStartDay: 1 as const, target: 4, floor: 3 };

describe("readHabit", () => {
  it("counts each week from the one the goal started in", () => {
    const h = readHabit(
      days([
        ["2026-10-06", 1],
        ["2026-10-07", 1],
        ["2026-10-09", 1],
        ["2026-10-13", 1],
        ["2026-10-20", 4],
        ["2026-10-27", 2],
      ]),
      { ...base, todayIso: "2026-10-28" }
    );
    expect(h.weeks.map((w) => [w.start, w.done, w.kept])).toEqual([
      ["2026-10-05", 3, true],
      ["2026-10-12", 1, false],
      ["2026-10-19", 4, true],
      ["2026-10-26", 2, false],
    ]);
    expect(h.thisWeek).toBe(2);
    expect(h.kept).toBe(2);
    expect(h.total).toBe(13);
  });

  it("doesn't break the streak for a week still in progress", () => {
    const h = readHabit(days([["2026-10-20", 3]]), { ...base, startIso: "2026-10-19", todayIso: "2026-10-27" });
    expect(h.streak).toBe(1);
    expect(habitLine(h)).toBe("0 of 4 this week · 1 of 11 weeks kept");
  });

  it("stops at the end date once the goal is over", () => {
    const h = readHabit(days([]), { ...base, startIso: "2026-12-14", todayIso: "2027-02-01" });
    expect(h.weeks.map((w) => w.start)).toEqual(["2026-12-14", "2026-12-21", "2026-12-28"]);
    expect(h.weeks.some((w) => w.current)).toBe(false);
  });

  it("needs at least one when the minimum is zero", () => {
    const h = readHabit(days([]), { ...base, floor: 0, startIso: "2026-10-19", todayIso: "2026-10-27" });
    expect(h.weeks[0].kept).toBe(false);
  });
});
