import { describe, expect, it } from "vitest";
import { budgetProblem, freeHours, isShortGoal } from "./focus";

describe("freeHours", () => {
  it("takes sleep, the job and overhead out of 168", () => {
    expect(freeHours({ sleepHours: 8, jobHours: 40, overheadHours: 21 })).toBe(51);
    expect(freeHours({ sleepHours: 7.5, jobHours: 45, overheadHours: 20 })).toBe(50.5);
  });

  it("never goes below zero", () => {
    expect(freeHours({ sleepHours: 14, jobHours: 100, overheadHours: 100 })).toBe(0);
  });
});

describe("budgetProblem", () => {
  it("passes when the hours fit", () => {
    expect(budgetProblem(42, 51)).toBeNull();
    expect(budgetProblem(51, 51)).toBeNull();
  });

  it("says how far over", () => {
    expect(budgetProblem(56, 51)).toContain("5h more than the 51h");
  });
});

describe("isShortGoal", () => {
  const today = "2026-10-25";
  it("leaves destinations and future goals alone", () => {
    expect(isShortGoal({ level: "destination", start_date: "2026-09-19", target_date: "2026-12-31" }, today)).toBe(false);
    expect(isShortGoal({ level: "quarter", start_date: "2027-01-01", target_date: "2027-03-31" }, today)).toBe(false);
  });

  it("catches started goals ending within a year", () => {
    expect(isShortGoal({ level: "quarter", start_date: "2026-10-01", target_date: "2026-12-31" }, today)).toBe(true);
    expect(isShortGoal({ level: null, start_date: today, target_date: "2027-10-25" }, today)).toBe(true);
    expect(isShortGoal({ level: null, start_date: today, target_date: "2029-10-25" }, today)).toBe(false);
  });
});
