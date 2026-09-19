import { describe, expect, it } from "vitest";
import { periodLabel, periodRange, previousPeriod, reportsDue, weekStartsIn } from "./periods";

describe("periodRange", () => {
  it("covers weeks, months, quarters and years", () => {
    expect(periodRange("week", "2026-09-19", 1)).toEqual({ start: "2026-09-14", end: "2026-09-20" });
    expect(periodRange("month", "2026-02-10", 1)).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(periodRange("quarter", "2026-09-19", 1)).toEqual({ start: "2026-07-01", end: "2026-09-30" });
    expect(periodRange("year", "2026-09-19", 1)).toEqual({ start: "2026-01-01", end: "2026-12-31" });
  });

  it("steps back one period", () => {
    expect(previousPeriod("month", "2026-01-01", 1)).toEqual({ start: "2025-12-01", end: "2025-12-31" });
    expect(previousPeriod("quarter", "2026-07-01", 1)).toEqual({ start: "2026-04-01", end: "2026-06-30" });
  });
});

describe("periodLabel", () => {
  it("reads like a heading", () => {
    expect(periodLabel("month", "2026-09-01")).toBe("September 2026");
    expect(periodLabel("quarter", "2026-07-01")).toBe("Q3 2026");
    expect(periodLabel("year", "2026-01-01")).toBe("2026");
  });
});

describe("weekStartsIn", () => {
  it("lists weeks starting inside the range", () => {
    expect(weekStartsIn("2026-09-01", "2026-09-30", 1)).toEqual(["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]);
  });
});

describe("reportsDue", () => {
  it("offers last month, and the quarter near its end", () => {
    expect(reportsDue("2026-09-19", 1)).toEqual([
      { period: "month", start: "2026-08-01", end: "2026-08-31" },
      { period: "quarter", start: "2026-07-01", end: "2026-09-30" },
    ]);
  });

  it("offers last quarter early in the next, and the year in January", () => {
    expect(reportsDue("2027-01-10", 1)).toEqual([
      { period: "month", start: "2026-12-01", end: "2026-12-31" },
      { period: "quarter", start: "2026-10-01", end: "2026-12-31" },
      { period: "year", start: "2026-01-01", end: "2026-12-31" },
    ]);
  });

  it("offers only the month mid-quarter", () => {
    expect(reportsDue("2026-08-15", 1)).toEqual([{ period: "month", start: "2026-07-01", end: "2026-07-31" }]);
  });
});
