import { describe, expect, it } from "vitest";
import { LATE_GRACE_HOURS, isLogDayOpen } from "./logWindow";

describe("isLogDayOpen", () => {
  const today = "2026-09-26";

  it("keeps today open all day", () => {
    expect(isLogDayOpen(today, today, 0)).toBe(true);
    expect(isLogDayOpen(today, today, 23)).toBe(true);
  });

  it("keeps yesterday open only during the grace hours after midnight", () => {
    expect(isLogDayOpen("2026-09-25", today, 0)).toBe(true);
    expect(isLogDayOpen("2026-09-25", today, LATE_GRACE_HOURS - 1)).toBe(true);
    expect(isLogDayOpen("2026-09-25", today, LATE_GRACE_HOURS)).toBe(false);
    expect(isLogDayOpen("2026-09-25", today, 14)).toBe(false);
  });

  it("closes anything older than yesterday, even after midnight", () => {
    expect(isLogDayOpen("2026-09-24", today, 0)).toBe(false);
  });

  it("closes future days", () => {
    expect(isLogDayOpen("2026-09-27", today, 12)).toBe(false);
    expect(isLogDayOpen("2026-09-27", today, 0)).toBe(false);
  });

  it("handles yesterday across a month boundary", () => {
    expect(isLogDayOpen("2026-09-30", "2026-10-01", 1)).toBe(true);
  });
});
