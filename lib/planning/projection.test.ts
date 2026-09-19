import { describe, expect, it } from "vitest";
import {
  distanceCovered,
  expectedBand,
  leadOver,
  loanBalance,
  pathSeries,
  readingDue,
  resolveCheckpoints,
  statusOf,
  trailingAverage,
  type Path,
} from "./projection";
import { quarterEndsBetween, quarterOf, suggestQuarterCheckpoints } from "./quarters";
import { formatBand, formatInr, formatMeasure } from "./format";

// Numbers from the author's own 2026–2034 roadmap, the acceptance fixture.
const weight: Path = {
  baseline: { date: "2026-09-19", value: 95 },
  checkpoints: [
    { date: "2026-12-31", min: 89, max: 90, label: "End of 2026" },
    { date: "2027-06-30", min: 82, max: 85, label: "Mid-2027", holdUntil: "2028-06-30" },
    { date: "2034-09-30", min: 80, max: 83, label: "Age 32" },
  ],
  interpolate: "linear",
};

const profit: Path = {
  baseline: { date: "2026-12-31", value: 100_000 },
  checkpoints: [
    { date: "2027-12-31", min: 140_000, max: 140_000 },
    { date: "2028-12-31", min: 200_000, max: 200_000 },
  ],
  interpolate: "compound",
};

describe("expectedBand", () => {
  it("is null before the plan starts", () => {
    expect(expectedBand(weight, "2026-09-01")).toBeNull();
  });

  it("starts at the baseline", () => {
    expect(expectedBand(weight, "2026-09-19")).toEqual({ min: 95, max: 95 });
  });

  it("interpolates each bound on its own", () => {
    const band = expectedBand(weight, "2026-11-09")!; // about half way to 31 Dec
    expect(band.min!).toBeCloseTo(92.1, 0);
    expect(band.max!).toBeCloseTo(92.6, 0);
    expect(band.max!).toBeGreaterThan(band.min!);
  });

  it("lands exactly on a checkpoint", () => {
    expect(expectedBand(weight, "2026-12-31")).toEqual({ min: 89, max: 90 });
  });

  it("holds a band flat until hold_until, then moves on", () => {
    expect(expectedBand(weight, "2027-12-01")).toEqual({ min: 82, max: 85 });
    expect(expectedBand(weight, "2028-06-30")).toEqual({ min: 82, max: 85 });
    const later = expectedBand(weight, "2031-08-15")!;
    expect(later.max!).toBeLessThan(85);
    expect(later.max!).toBeGreaterThan(83);
  });

  it("keeps the last band after the final checkpoint", () => {
    expect(expectedBand(weight, "2040-01-01")).toEqual({ min: 80, max: 83 });
  });

  it("compounds growth metrics instead of drawing a straight line", () => {
    const mid = expectedBand(profit, "2027-07-02")!.min!;
    // Geometric midpoint of 1.0 L → 1.4 L is ~1.183 L; a straight line gives 1.2 L.
    expect(mid).toBeGreaterThan(117_000);
    expect(mid).toBeLessThan(119_500);
  });

  it("leaves an open bound open (under 94 cm has no floor)", () => {
    const waist: Path = {
      baseline: { date: "2026-10-01", value: 104 },
      checkpoints: [{ date: "2027-06-30", min: null, max: 94 }],
      interpolate: "linear",
    };
    const band = expectedBand(waist, "2027-02-14")!;
    expect(band.min).toBeNull();
    expect(band.max!).toBeGreaterThan(94);
    expect(band.max!).toBeLessThan(104);
  });

  it("steps for ladders: the level is only due on its date", () => {
    const skill: Path = {
      baseline: { date: "2026-09-19", value: 1 },
      checkpoints: [
        { date: "2026-12-31", min: 2, max: null },
        { date: "2027-06-30", min: 4, max: null },
      ],
      interpolate: "step",
    };
    expect(expectedBand(skill, "2026-12-30")!.min).toBe(1);
    expect(expectedBand(skill, "2026-12-31")!.min).toBe(2);
    expect(expectedBand(skill, "2027-05-01")!.min).toBe(2);
  });
});

describe("relative checkpoints", () => {
  const waistDown: Path = {
    baseline: null,
    checkpoints: [{ date: "2026-12-31", min: -5, max: -4, relative: true }],
    interpolate: "linear",
  };

  it("wait for a baseline", () => {
    expect(resolveCheckpoints(waistDown.checkpoints, null).needsBaseline).toBe(true);
    expect(expectedBand(waistDown, "2026-12-31")).toBeNull();
  });

  it("resolve against the first measurement", () => {
    const measured = { ...waistDown, baseline: { date: "2026-09-25", value: 104 } };
    expect(expectedBand(measured, "2026-12-31")).toEqual({ min: 99, max: 100 });
  });
});

describe("status", () => {
  const band = { min: 89, max: 90 };
  it("reads weight downwards", () => {
    expect(statusOf("down", band, 88.5)).toBe("ahead");
    expect(statusOf("down", band, 89.5)).toBe("on_track");
    expect(statusOf("down", band, 91)).toBe("catching_up");
  });
  it("reads profit upwards", () => {
    expect(statusOf("up", { min: 140_000, max: 140_000 }, 150_000)).toBe("ahead");
    expect(statusOf("up", { min: 140_000, max: 140_000 }, 120_000)).toBe("catching_up");
  });
  it("flags a habit band either way", () => {
    expect(statusOf("band", { min: 2100, max: 2400 }, 2600)).toBe("off_band");
    expect(statusOf("band", { min: 2100, max: 2400 }, 2200)).toBe("on_track");
  });
  it("measures the lead in the goal's direction", () => {
    expect(leadOver("down", band, 88.7)).toBeCloseTo(0.3);
    expect(leadOver("down", band, 91)).toBeCloseTo(-1);
    expect(leadOver("up", { min: 100, max: 100 }, 90)).toBe(-10);
  });
});

describe("distanceCovered", () => {
  it("uses the best reading, so a bounce back never loses distance", () => {
    const readings = [
      { date: "2026-10-10", value: 93 },
      { date: "2026-11-10", value: 88.9 },
      { date: "2026-12-10", value: 89.6 },
    ];
    // For "down" the finish line is the top of the final band: 80–83 → 83.
    const share = distanceCovered(weight, "down", readings)!;
    expect(share).toBeCloseTo((95 - 88.9) / (95 - 83), 5);
  });
});

describe("helpers", () => {
  it("averages a trailing window", () => {
    const avg = trailingAverage(
      [
        { date: "2026-10-01", value: 95 },
        { date: "2026-10-03", value: 94 },
        { date: "2026-10-09", value: 93 },
      ],
      7
    );
    expect(avg.map((p) => p.value)).toEqual([95, 94.5, 93.5]);
  });

  it("counts loan EMIs still to pay", () => {
    // Bike loan: ₹13k, last EMI 5 Oct 2027.
    expect(loanBalance(13_000, "2027-10-05", "2026-09-19")).toBe(13 * 13_000);
    expect(loanBalance(13_000, "2027-10-05", "2027-10-05")).toBe(0);
    expect(loanBalance(13_000, "2027-10-05", "2027-10-04")).toBe(13_000);
    expect(loanBalance(13_000, "2027-10-05", "2028-01-01")).toBe(0);
  });

  it("knows when a reading is due", () => {
    expect(readingDue("monthly", null, "2026-09-19")).toBe(true);
    expect(readingDue("weekly", "2026-09-15", "2026-09-19")).toBe(false);
    expect(readingDue("weekly", "2026-09-12", "2026-09-19")).toBe(true);
  });

  it("samples a chart series including checkpoints", () => {
    const series = pathSeries(weight, "2026-09-19", "2027-06-30", 6);
    expect(series.some((p) => p.date === "2026-12-31" && p.min === 89)).toBe(true);
    expect(series[0]).toEqual({ date: "2026-09-19", min: 95, max: 95 });
  });
});

describe("quarters", () => {
  it("finds the quarter of a date", () => {
    expect(quarterOf("2027-04-15")).toEqual({ year: 2027, q: 2 });
  });

  it("lists quarter ends between two dates", () => {
    expect(quarterEndsBetween("2026-12-31", "2027-12-31").map((q) => q.label)).toEqual([
      "Q1 2027",
      "Q2 2027",
      "Q3 2027",
    ]);
  });

  it("suggests quarter checkpoints on the path", () => {
    const suggested = suggestQuarterCheckpoints(profit, Math.round);
    expect(suggested.map((c) => c.label)).toEqual([
      "Q1 2027",
      "Q2 2027",
      "Q3 2027",
      "Q1 2028",
      "Q2 2028",
      "Q3 2028",
    ]);
    const q2 = suggested.find((c) => c.label === "Q2 2027")!;
    expect(q2.min).toBeGreaterThan(115_000);
    expect(q2.min).toBeLessThan(120_000);
  });
});

describe("format", () => {
  it("speaks rupees in lakh and crore", () => {
    expect(formatInr(9000)).toBe("₹9,000");
    expect(formatInr(140_000)).toBe("₹1.4 L");
    expect(formatInr(150_000_000)).toBe("₹15 Cr");
    expect(formatInr(-9000)).toBe("−₹9,000");
  });
  it("formats values and bands", () => {
    expect(formatMeasure(89.4, "kg")).toBe("89.4 kg");
    expect(formatMeasure(3, "level")).toBe("L3");
    expect(formatBand(89, 90, "kg")).toBe("89–90 kg");
    expect(formatBand(null, 94, "cm")).toBe("under 94 cm");
    expect(formatBand(50_000, null, "inr")).toBe("₹50,000+");
  });
});
