import { describe, expect, it } from "vitest";
import { proposalDraft, type ProposalDestination } from "./proposal";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const UUID_Q = "33333333-3333-4333-8333-333333333333";

const destinations: ProposalDestination[] = [
  {
    ref: "D1",
    id: UUID_A,
    title: "Weight 80–83 kg, held steady",
    area: "health",
    level: "destination",
    streamName: "Health",
    streamArea: "health",
    startDate: "2026-09-19",
    targetDate: "2034-09-30",
    nextQuarterGoal: null,
  },
  {
    ref: "D2",
    id: UUID_B,
    title: "Company profit ₹15 L/month",
    area: "work",
    level: "destination",
    streamName: "Dad's company",
    streamArea: "work",
    startDate: "2026-09-19",
    targetDate: "2034-09-30",
    nextQuarterGoal: { id: UUID_Q, title: "Q4 2026: profit ₹1.1 L", steps: ["Price list for the new SKU"] },
  },
];

describe("proposalDraft", () => {
  it("puts a new quarter goal under an existing destination", () => {
    const { draft } = proposalDraft(
      [{ ref: "D1", title: "weight to 91–92 kg", projects: ["Blood test", "Meal-prep Sundays"], why: "Holiday season" }],
      destinations,
      { year: 2026, q: 4 },
      "2026-09-25"
    );
    const [dest, quarter] = draft.goals;
    expect(dest).toMatchObject({ existingId: UUID_A, steps: [], measures: [] });
    expect(quarter).toMatchObject({
      existingId: null,
      parentKey: dest.key,
      title: "Q4 2026: weight to 91–92 kg",
      level: "quarter",
      startDate: "2026-10-01",
      targetDate: "2026-12-31",
      steps: ["Blood test", "Meal-prep Sundays"],
    });
    expect(draft.streams).toEqual([{ key: "s1", name: "Health", area: "health", weeklyHours: null, include: true }]);
    expect(quarter.streamKey).toBe("s1");
  });

  it("adds only new projects to a quarter goal that already exists", () => {
    const { draft } = proposalDraft(
      [{ ref: "d2", title: "Q4 2026: profit ₹1.1 L", projects: ["price list for the new SKU", "Visit 5 dealers"], why: "" }],
      destinations,
      { year: 2026, q: 4 },
      "2026-09-25"
    );
    const quarter = draft.goals.find((g) => g.key === "q-D2")!;
    expect(quarter.existingId).toBe(UUID_Q);
    expect(quarter.steps).toEqual(["Visit 5 dealers"]);
  });

  it("skips unknown refs and destinations with nothing new", () => {
    const { draft } = proposalDraft(
      [
        { ref: "D9", title: "x", projects: ["y"], why: "" },
        { ref: "D2", title: "x", projects: ["Price list for the new SKU"], why: "" },
      ],
      destinations,
      { year: 2026, q: 4 },
      "2026-09-25"
    );
    expect(draft.goals).toEqual([]);
  });
});
