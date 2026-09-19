import { describe, expect, it } from "vitest";
import { goalsInSaveOrder, normalizeDraft, planDraftSchema } from "./draft";

const today = "2026-09-19";

describe("planDraftSchema", () => {
  it("keeps what's usable from a rough model answer", () => {
    const draft = planDraftSchema.parse({
      streams: [{ key: "health", name: "Health", area: "health" }, { key: "bad" }],
      goals: [
        {
          key: "weight",
          streamKey: "health",
          title: "Weight 80–83 kg",
          area: "not-an-area",
          targetDate: "2034-09-30",
          steps: [],
          measures: [
            {
              label: "Weight",
              kind: "number",
              direction: "down",
              interpolate: "linear",
              source: "body.weight_kg",
              cadence: "weekly",
              checkpoints: [
                { date: "2026-12-31", min: 89, max: 90, relative: false },
                { date: "End of 2027", min: 82, max: 85, relative: false },
              ],
            },
          ],
          levers: [{ title: "Strength", source: "workouts", period: "week", target: 4 }, { title: "" }],
        },
      ],
      notes: "Spending priority…",
      questions: [],
    });
    expect(draft.streams).toHaveLength(1);
    expect(draft.goals[0].area).toBe("self");
    expect(draft.goals[0].measures[0].checkpoints).toHaveLength(1); // the loose date is dropped
    expect(draft.goals[0].levers).toHaveLength(1);
    expect(draft.goals[0].include).toBe(true);
  });
});

describe("normalizeDraft", () => {
  const base = planDraftSchema.parse({
    streams: [{ key: "s", name: "Company", area: "work" }],
    goals: [
      {
        key: "profit",
        streamKey: "missing",
        title: "Profit",
        area: "work",
        targetDate: "2034-09-30",
        steps: [],
        measures: [
          {
            label: "Profit per month",
            kind: "number",
            direction: "up",
            interpolate: "compound",
            source: "loan_schedule",
            cadence: "monthly",
            baselineValue: 100000,
            checkpoints: [
              { date: "2027-12-31", min: 150000, max: 140000, relative: false },
              { date: "2027-12-31", min: 140000, max: 140000, relative: false, holdUntil: "2020-01-01" },
            ],
          },
        ],
        levers: [{ title: "Quotes sent", source: "tick", period: "week", target: 5 }],
      },
      { key: "q4", parentKey: "profit", title: "Q4", area: "work", targetDate: "2026-12-31", steps: ["List 20 customers"], measures: [], levers: [] },
      { key: "loop", parentKey: "loop", title: "Loop", area: "work", targetDate: "2027-01-01", steps: [], measures: [], levers: [] },
      { key: "old", title: "Past", area: "work", targetDate: "2025-01-01", steps: [], measures: [], levers: [] },
    ],
    notes: "",
    questions: [],
  });

  const { draft, warnings } = normalizeDraft(base, today);
  const profit = draft.goals.find((g) => g.key === "profit")!;

  it("drops links to streams and parents that don't exist, and self-loops", () => {
    expect(profit.streamKey).toBeNull();
    expect(draft.goals.find((g) => g.key === "loop")!.parentKey).toBeNull();
    expect(draft.goals.find((g) => g.key === "q4")!.parentKey).toBe("profit");
  });

  it("repairs checkpoints: one per date, holds after the date", () => {
    const m = profit.measures[0];
    expect(m.checkpoints).toHaveLength(1);
    expect(m.checkpoints[0].holdUntil).toBeNull();
  });

  it("falls back to a typed number when a loan has no schedule, and a half baseline is cleared", () => {
    const m = profit.measures[0];
    expect(m.source).toBe("manual");
    expect(m.baselineValue).toBeNull();
    expect(warnings.some((w) => w.includes("loan"))).toBe(true);
  });

  it("fills a missing minimum with half the target", () => {
    expect(profit.levers[0].floor).toBe(3);
  });

  it("leaves out goals that already ended, with a warning", () => {
    expect(draft.goals.find((g) => g.key === "old")!.include).toBe(false);
    expect(warnings.some((w) => w.includes("Past"))).toBe(true);
  });

  it("saves parents before children", () => {
    expect(goalsInSaveOrder(draft.goals).map((g) => g.key).indexOf("profit")).toBeLessThan(
      goalsInSaveOrder(draft.goals).map((g) => g.key).indexOf("q4")
    );
  });
});
