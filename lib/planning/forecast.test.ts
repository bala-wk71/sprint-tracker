import { describe, expect, it } from "vitest";
import { bestPace, fitTrend, forecastMeasure } from "./forecast";
import type { Point } from "./projection";
import { addDaysIso } from "@/lib/week";

/** A reading every `every` days from `from`, changing by `perDay`. */
const series = (from: string, days: number, start: number, perDay: number, every = 1): Point[] =>
  Array.from({ length: Math.floor(days / every) + 1 }, (_, i) => ({
    date: addDaysIso(from, i * every),
    value: start + perDay * i * every,
  }));

describe("fitTrend", () => {
  it("recovers a straight line", () => {
    const t = fitTrend(series("2026-08-01", 42, 95, -0.1), "2026-08-01", "2026-09-12")!;
    expect(t.perDay).toBeCloseTo(-0.1, 5);
    expect(t.valueAt("2026-09-12")).toBeCloseTo(90.8, 5);
  });

  it("needs three readings over two weeks", () => {
    expect(fitTrend(series("2026-09-01", 2, 95, -0.1), "2026-09-01", "2026-09-19")).toBeNull();
    expect(fitTrend(series("2026-09-01", 10, 95, -0.1), "2026-09-01", "2026-09-19")).toBeNull();
  });

  it("fits compounding growth on the log", () => {
    // 3% a month for six months.
    const points = Array.from({ length: 7 }, (_, i) => ({
      date: addDaysIso("2026-03-01", i * 30),
      value: 100_000 * Math.pow(1.03, i),
    }));
    const t = fitTrend(points, "2026-03-01", "2026-09-30", true)!;
    expect(t.compound).toBe(true);
    expect(t.valueAt(addDaysIso("2026-03-01", 210))).toBeCloseTo(100_000 * Math.pow(1.03, 7), -1);
  });
});

describe("bestPace", () => {
  it("finds the fastest stretch, in the good direction", () => {
    const slow = series("2026-06-01", 60, 96, -0.02);
    const fast = series("2026-07-31", 60, slow.at(-1)!.value, -0.1).slice(1);
    expect(bestPace([...slow, ...fast], "down", 56)).toBeCloseTo(0.1, 2);
  });
});

describe("forecastMeasure", () => {
  const next = { date: "2026-12-31", min: 89, max: 90 };

  it("is on pace when the trend lands inside the target", () => {
    // 95 → just under 90 by 31 Dec at 0.035 kg a day.
    const f = forecastMeasure({
      points: series("2026-08-01", 49, 95, -0.035),
      direction: "down",
      cadence: "weekly",
      compound: false,
      next,
      todayIso: "2026-09-19",
    })!;
    expect(f.verdict).toBe("on_pace");
    expect(f.projected).toBeLessThanOrEqual(90);
    expect(f.line[0]).toEqual({ date: "2026-09-19", value: expect.closeTo(93.285, 5) });
    expect(f.line[1].date).toBe("2026-12-31");
  });

  it("is early when it arrives weeks before the date", () => {
    const f = forecastMeasure({
      points: series("2026-08-01", 49, 95, -0.1),
      direction: "down",
      cadence: "weekly",
      compound: false,
      next,
      todayIso: "2026-09-19",
    })!;
    expect(f.verdict).toBe("early");
    expect(f.arrives! < "2026-12-10").toBe(true);
  });

  it("is recoverable when the needed pace has been held before", () => {
    // Fast in the summer, stalled lately.
    const fast = series("2026-06-01", 60, 100, -0.1);
    const stalled = series("2026-07-31", 50, fast.at(-1)!.value, -0.005).slice(1);
    const f = forecastMeasure({
      points: [...fast, ...stalled],
      direction: "down",
      cadence: "weekly",
      compound: false,
      next,
      todayIso: "2026-09-19",
    })!;
    expect(f.verdict).toBe("recoverable");
    expect(f.neededPerDay).toBeGreaterThan(0);
    expect(f.bestPerDay!).toBeGreaterThanOrEqual(f.neededPerDay);
  });

  it("suggests a replan when the needed pace is past anything managed", () => {
    const f = forecastMeasure({
      points: series("2026-06-01", 110, 100, -0.01),
      direction: "down",
      cadence: "weekly",
      compound: false,
      next,
      todayIso: "2026-09-19",
    })!;
    expect(f.verdict).toBe("replan");
    expect(f.arrives === null || f.arrives > "2026-12-31").toBe(true);
  });

  it("never suggests a replan on a few weeks of data", () => {
    const f = forecastMeasure({
      points: series("2026-08-25", 25, 95, -0.005),
      direction: "down",
      cadence: "weekly",
      compound: false,
      next,
      todayIso: "2026-09-19",
    })!;
    expect(f.verdict).toBe("recoverable");
  });

  it("says there when the latest reading already meets the target", () => {
    const f = forecastMeasure({
      points: series("2026-08-01", 49, 92, -0.05),
      direction: "down",
      cadence: "weekly",
      compound: false,
      next: { date: "2026-12-31", min: null, max: 94 },
      todayIso: "2026-09-19",
    })!;
    expect(f.verdict).toBe("there");
  });

  it("works upwards for monthly money", () => {
    const points = Array.from({ length: 7 }, (_, i) => ({
      date: addDaysIso("2026-03-31", i * 30),
      value: 100_000 * Math.pow(1.03, i),
    }));
    const f = forecastMeasure({
      points,
      direction: "up",
      cadence: "monthly",
      compound: true,
      next: { date: "2026-12-31", min: 140_000, max: null },
      todayIso: "2026-09-30",
    })!;
    // 3% a month for three more months from ~₹1.19 L lands near ₹1.3 L: short of ₹1.4 L.
    expect(f.projected).toBeGreaterThan(125_000);
    expect(f.projected).toBeLessThan(140_000);
    expect(["recoverable", "replan"]).toContain(f.verdict);
  });

  it("stays quiet for ranges and without a next checkpoint", () => {
    const points = series("2026-08-01", 49, 95, -0.05);
    const base = { points, cadence: "weekly" as const, compound: false, todayIso: "2026-09-19" };
    expect(forecastMeasure({ ...base, direction: "band", next })).toBeNull();
    expect(forecastMeasure({ ...base, direction: "down", next: null })).toBeNull();
  });
});
