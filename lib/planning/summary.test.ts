import { describe, expect, it } from "vitest";
import { loanSeries, summarizeMeasure, type CheckpointRow, type MeasureRow } from "./summary";

const measure = (patch: Partial<MeasureRow> = {}): MeasureRow => ({
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
  baseline_value: null,
  baseline_on: null,
  scale: [],
  position: 0,
  ...patch,
});

const cp = (patch: Partial<CheckpointRow>): CheckpointRow => ({
  id: "c1",
  measure_id: "m1",
  target_date: "2026-12-31",
  label: null,
  min_value: null,
  max_value: null,
  relative: false,
  hold_until: null,
  ...patch,
});

describe("summarizeMeasure", () => {
  it("anchors an auto source on its first reading after the goal started", () => {
    const s = summarizeMeasure({
      measure: measure(),
      checkpoints: [cp({ min_value: 89, max_value: 90 })],
      points: [
        { date: "2026-09-10", value: 96 },
        { date: "2026-09-19", value: 95 },
        { date: "2026-10-19", value: 93.4 }, // path is ~93.3–93.5 by now
      ],
      goalStart: "2026-09-15",
      todayIso: "2026-10-19",
    });
    expect(s.path.baseline).toEqual({ date: "2026-09-19", value: 95 });
    expect(s.status).toBe("on_track");
    expect(s.covered).toBeCloseTo(1.6 / 5, 5);
    expect(s.due).toBe(false); // auto sources never ask
    expect(s.next?.date).toBe("2026-12-31");
  });

  it("says catching up, with the gap, when above the path", () => {
    const s = summarizeMeasure({
      measure: measure(),
      checkpoints: [cp({ min_value: 89, max_value: 90 })],
      points: [
        { date: "2026-09-19", value: 95 },
        { date: "2026-12-31", value: 91 },
      ],
      goalStart: "2026-09-19",
      todayIso: "2026-12-31",
    });
    expect(s.status).toBe("catching_up");
    expect(s.lead).toBeCloseTo(-1);
  });

  it("asks for a first measurement when a relative target has no baseline", () => {
    const s = summarizeMeasure({
      measure: measure({ source: "body.waist_cm", unit: "cm" }),
      checkpoints: [cp({ min_value: -5, max_value: -4, relative: true })],
      points: [],
      goalStart: "2026-09-19",
      todayIso: "2026-09-20",
    });
    expect(s.needsBaseline).toBe(true);
    expect(s.status).toBe("needs_reading");
  });

  it("flags a manual reading as due once its cadence passes", () => {
    const s = summarizeMeasure({
      measure: measure({ source: "manual", cadence: "monthly", direction: "up", unit: "inr" }),
      checkpoints: [cp({ target_date: "2027-12-31", min_value: 140000, max_value: 140000 })],
      points: [{ date: "2026-08-01", value: 100000 }],
      goalStart: "2026-08-01",
      todayIso: "2026-09-19",
    });
    expect(s.due).toBe(true);
  });

  it("has no plan until a checkpoint exists", () => {
    const s = summarizeMeasure({
      measure: measure(),
      checkpoints: [],
      points: [{ date: "2026-09-19", value: 95 }],
      goalStart: "2026-09-19",
      todayIso: "2026-09-19",
    });
    expect(s.status).toBe("no_plan");
  });
});

describe("loanSeries", () => {
  const params = { emi: 13_000, lastEmiOn: "2027-10-05" };

  it("follows the EMI schedule", () => {
    const series = loanSeries(params, [], "2026-09-19", "2026-12-19");
    expect(series[0]).toEqual({ date: "2026-09-19", value: 13 * 13_000 });
    expect(series.at(-1)).toEqual({ date: "2026-12-19", value: 10 * 13_000 });
  });

  it("lets a typed balance override the schedule after a prepayment", () => {
    const series = loanSeries(params, [{ date: "2026-11-10", value: 50_000 }], "2026-09-19", "2026-12-19");
    // One EMI (5 Dec) falls due after the typed balance.
    expect(series.at(-1)!.value).toBe(50_000 - 13_000);
  });
});
