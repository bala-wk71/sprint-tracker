import { describe, expect, it } from "vitest";
import { activityFromSets, hitsKcal, hitsProtein, sessionCounts } from "./daily";

describe("sessionCounts", () => {
  it("counts every session for 'workouts'", () => {
    expect(sessionCounts("workouts", null)).toBe(true);
    expect(sessionCounts("workouts", "walk")).toBe(true);
  });
  it("keeps football out of strength and gym out of sport", () => {
    expect(sessionCounts("strength", "sport")).toBe(false);
    expect(sessionCounts("sport", "strength")).toBe(false);
    expect(sessionCounts("sport", "sport")).toBe(true);
  });
  it("counts walks as cardio", () => {
    expect(sessionCounts("cardio", "walk")).toBe(true);
    expect(sessionCounts("cardio", "cardio")).toBe(true);
    expect(sessionCounts("cardio", "strength")).toBe(false);
  });
});

describe("activityFromSets", () => {
  it("is strength when any set is not cardio", () => {
    expect(activityFromSets([{ name: "Walking", muscle_group: "cardio" }, { name: "Bench Press", muscle_group: "chest" }])).toBe("strength");
  });
  it("tells a walk from other cardio", () => {
    expect(activityFromSets([{ name: "Walking", muscle_group: "cardio" }])).toBe("walk");
    expect(activityFromSets([{ name: "Treadmill", muscle_group: "cardio" }])).toBe("cardio");
  });
  it("is unknown with no sets", () => {
    expect(activityFromSets([])).toBeNull();
  });
});

describe("nutrition targets", () => {
  it("needs the full protein target", () => {
    expect(hitsProtein(149, 150)).toBe(false);
    expect(hitsProtein(150, 150)).toBe(true);
    expect(hitsProtein(200, null)).toBe(false);
  });
  it("accepts calories within 10% either side", () => {
    expect(hitsKcal(2025, 2250)).toBe(true);
    expect(hitsKcal(2475, 2250)).toBe(true);
    expect(hitsKcal(2000, 2250)).toBe(false);
    expect(hitsKcal(2600, 2250)).toBe(false);
    expect(hitsKcal(2250, null)).toBe(false);
  });
});
