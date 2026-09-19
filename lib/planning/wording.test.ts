import { describe, expect, it } from "vitest";
import { summarizeMeasure, type MeasureRow } from "./summary";
import { forecastLine, formatRate } from "./wording";
import { addDaysIso } from "@/lib/week";

const measure: MeasureRow = {
  id: "m1",
  goal_id: "g1",
  label: "Weight",
  kind: "number",
  unit: "kg",
  direction: "down",
  interpolate: "linear",
  source: "body.weight_kg",
  source_params: {},
  cadence: "weekly",
  baseline_value: 100,
  baseline_on: "2026-06-01",
  scale: [],
  position: 0,
};

const summary = (perDay: number) =>
  summarizeMeasure({
    measure,
    checkpoints: [
      { id: "c1", measure_id: "m1", target_date: "2026-12-31", label: null, min_value: 89, max_value: 90, relative: false, hold_until: null },
    ],
    points: Array.from({ length: 111 }, (_, i) => ({ date: addDaysIso("2026-06-01", i), value: 100 + perDay * i })),
    goalStart: "2026-06-01",
    todayIso: "2026-09-19",
  });

describe("formatRate", () => {
  it("talks in weeks for weekly readings and months otherwise", () => {
    expect(formatRate(-0.1, "kg", "weekly")).toBe("0.7 kg a week");
    expect(formatRate(200, "inr", "monthly")).toBe("₹6,000 a month");
  });
});

describe("forecastLine", () => {
  it("offers a replan with the pace it needs and the best so far", () => {
    const read = forecastLine(summary(-0.01), "2026-09-19")!;
    expect(read.replan).toBe(true);
    expect(read.text).toMatch(/31 Dec needs .* kg a week; your best so far is 0\.07 kg a week\./);
  });

  it("names the arrival date when early", () => {
    const read = forecastLine(summary(-0.08), "2026-09-19")!;
    expect(read.replan).toBe(false);
    expect(read.text).toMatch(/^At this pace you reach 89–90 kg around .*, ahead of 31 Dec\.$/);
  });
});
