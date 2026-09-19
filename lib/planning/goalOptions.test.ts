import { describe, expect, it } from "vitest";
import { groupGoalOptions } from "./goalOptions";
import { effectiveStreams } from "./streams";

const goal = (id: string, patch: Record<string, unknown> = {}) => ({
  id,
  title: id,
  parent_id: null as string | null,
  stream_id: null as string | null,
  level: null as string | null,
  start_date: "2026-01-01",
  target_date: "2030-01-01",
  ...patch,
});

describe("effectiveStreams", () => {
  it("inherits the nearest ancestor's stream", () => {
    const map = effectiveStreams([
      goal("profit", { stream_id: "company" }),
      goal("q4", { parent_id: "profit" }),
      goal("proj", { parent_id: "q4" }),
      goal("loose"),
    ]);
    expect(map.get("proj")).toBe("company");
    expect(map.get("loose")).toBeNull();
  });
});

describe("groupGoalOptions", () => {
  const streams = [
    { id: "company", name: "Dad's company" },
    { id: "health", name: "Health" },
  ];

  it("stays flat when there are no streams", () => {
    expect(groupGoalOptions([goal("a")], [], "2026-09-19")).toEqual([{ id: "a", title: "a" }]);
  });

  it("orders by stream, current quarter goals first, others last", () => {
    const options = groupGoalOptions(
      [
        goal("loose"),
        goal("weight", { stream_id: "health" }),
        goal("profit", { stream_id: "company" }),
        goal("q4", { parent_id: "profit", level: "quarter", start_date: "2026-09-19", target_date: "2026-12-31" }),
      ],
      streams,
      "2026-10-01"
    );
    expect(options.map((o) => [o.id, o.group])).toEqual([
      ["q4", "Dad's company"],
      ["profit", "Dad's company"],
      ["weight", "Health"],
      ["loose", "Other goals"],
    ]);
  });
});
