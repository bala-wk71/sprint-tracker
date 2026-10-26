import { describe, expect, it } from "vitest";
import { draftPhaseGoals, nextPhaseOf, phaseWhen, stripYear, type Phase } from "./phases";

const phase = (position: number, status: Phase["status"]): Phase => ({
  id: `p${position}`,
  position,
  name: `P${position}`,
  startsOn: "2027-01-01",
  endsOn: "2027-12-31",
  status,
});

describe("phaseWhen", () => {
  it("names whole years by the year", () => {
    expect(phaseWhen({ startsOn: "2027-01-01", endsOn: "2027-12-31" })).toBe("2027");
    expect(phaseWhen({ startsOn: "2031-01-01", endsOn: "2034-12-31" })).toBe("2031–2034");
  });

  it("gives dates otherwise", () => {
    expect(phaseWhen({ startsOn: "2026-09-19", endsOn: "2026-12-31" })).toBe("19 Sep – 31 Dec 2026");
    expect(phaseWhen({ startsOn: "2026-09-19", endsOn: "2027-03-31" })).toBe("19 Sep 2026 – 31 Mar 2027");
  });
});

describe("nextPhaseOf", () => {
  it("is the first upcoming phase by position", () => {
    expect(nextPhaseOf([phase(3, "upcoming"), phase(1, "done"), phase(2, "upcoming")])?.id).toBe("p2");
    expect(nextPhaseOf([phase(1, "done"), phase(2, "current")])).toBeNull();
  });
});

describe("stripYear", () => {
  it("drops a leading year or year range", () => {
    expect(stripYear("2027: Run 5K under 30 minutes")).toBe("Run 5K under 30 minutes");
    expect(stripYear("2031–2034: Build the home")).toBe("Build the home");
    expect(stripYear("Run 5K")).toBe("Run 5K");
  });
});

describe("draftPhaseGoals", () => {
  const streams = [
    { id: "health", name: "Health", focus: "push" },
    { id: "drone", name: "Drone", focus: "maintain" },
    { id: "money", name: "Money", focus: "push" },
  ];
  const goals = [
    { id: "gh", stream_id: "health", level: "destination", status: "active" },
    { id: "gd", stream_id: "drone", level: "destination", status: "active" },
    { id: "gm1", stream_id: "money", level: "destination", status: "active" },
    { id: "gm2", stream_id: "money", level: "destination", status: "active" },
    { id: "short", stream_id: "health", level: "quarter", status: "active" },
  ];
  const steps = [
    { id: "s1", goal_id: "gh", phase_id: "p2", title: "2027: Run 5K" },
    { id: "s2", goal_id: "gd", phase_id: "p2", title: "2027: First grant" },
    { id: "s3", goal_id: "gm1", phase_id: "p2", title: "2027: Bike loan ends" },
    { id: "s4", goal_id: "gm2", phase_id: "p2", title: "2027: Emergency fund ₹2.5 L" },
    { id: "s5", goal_id: "gh", phase_id: "p3", title: "2028: Run 10K" },
    { id: "s6", goal_id: "short", phase_id: "p2", title: "Not from a long-range goal" },
  ];

  it("makes one goal per push stream from that phase's steps", () => {
    const { goals: drafts } = draftPhaseGoals({ id: "p2", name: "The Move" }, streams, goals, steps);
    expect(drafts).toEqual([
      { streamId: "health", streamName: "Health", parentId: "gh", title: "The Move · Health", steps: ["Run 5K"] },
      { streamId: "money", streamName: "Money", parentId: "gm1", title: "The Move · Money", steps: ["Bike loan ends", "Emergency fund ₹2.5 L"] },
    ]);
  });

  it("leaves maintain streams' steps waiting", () => {
    const { waiting } = draftPhaseGoals({ id: "p2", name: "The Move" }, streams, goals, steps);
    expect(waiting).toEqual([{ streamName: "Drone", steps: ["First grant"] }]);
  });
});
