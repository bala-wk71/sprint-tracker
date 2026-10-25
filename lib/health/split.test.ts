import { describe, expect, it } from "vitest";
import { isFullDay, nextSplitDay, splitFromName, splitOfSession } from "./split";

describe("splitFromName", () => {
  it("reads the day from the session name", () => {
    expect(splitFromName("Push")).toBe("push");
    expect(splitFromName("pull day")).toBe("pull");
    expect(splitFromName("Leg day")).toBe("legs");
    expect(splitFromName("Imported")).toBeNull();
    expect(splitFromName(null)).toBeNull();
    expect(splitFromName("Pushups at home")).toBeNull();
  });
});

describe("splitOfSession", () => {
  it("prefers the name over the exercises", () => {
    expect(splitOfSession("Legs", ["chest", "triceps"])).toBe("legs");
  });

  it("votes one per exercise, ignoring shoulders and abs", () => {
    expect(splitOfSession("Imported", ["chest", "chest", "shoulders", "triceps"])).toBe("push");
    expect(splitOfSession(null, ["back", "biceps", "shoulders", "abs"])).toBe("pull");
    expect(splitOfSession(null, ["quads", "hamstrings", "legs"])).toBe("legs");
  });

  it("gives no answer on a tie or with nothing to go on", () => {
    expect(splitOfSession(null, ["chest", "back"])).toBeNull();
    expect(splitOfSession(null, ["shoulders", "cardio"])).toBeNull();
    expect(splitOfSession(null, [])).toBeNull();
  });
});

describe("nextSplitDay", () => {
  it("rotates push, pull, legs", () => {
    expect(nextSplitDay("push")).toBe("pull");
    expect(nextSplitDay("pull")).toBe("legs");
    expect(nextSplitDay("legs")).toBe("push");
    expect(nextSplitDay(null)).toBe("push");
  });
});

describe("isFullDay", () => {
  it("needs four exercises", () => {
    expect(isFullDay("legs", null, ["quads"])).toBe(false);
    expect(isFullDay("legs", null, ["quads", "hamstrings", "legs", "legs"])).toBe(true);
  });

  it("needs four in five on the day unless named for it", () => {
    expect(isFullDay("pull", null, ["chest", "back", "shoulders", "biceps"])).toBe(false);
    expect(isFullDay("pull", "Pull", ["chest", "back", "shoulders", "biceps"])).toBe(true);
    expect(isFullDay("pull", null, ["back", "back", "back", "chest", "biceps"])).toBe(true);
    expect(isFullDay("pull", null, ["back", "back", "chest", "biceps", "shoulders"])).toBe(false);
  });
});
