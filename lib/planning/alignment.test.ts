import { describe, expect, it } from "vitest";
import { goalSplit } from "./alignment";

const titles: Record<string, string> = { g1: "Health", g2: "Dad's company" };
const titleOf = (id: string) => titles[id] ?? null;

describe("goalSplit", () => {
  it("adds hours up per goal and names the rest", () => {
    const split = goalSplit(
      [
        { name: "Soliton", target_hours: 40, goal_id: null },
        { name: "Gym", target_hours: 5, goal_id: "g1" },
        { name: "Walks", target_hours: 2.5, goal_id: "g1" },
        { name: "Vinayaga", target_hours: 6, goal_id: "g2" },
      ],
      titleOf
    );
    expect(split.byGoal).toEqual([
      { goalId: "g1", title: "Health", hours: 7.5, tasks: 2 },
      { goalId: "g2", title: "Dad's company", hours: 6, tasks: 1 },
    ]);
    expect(split.goalHours).toBe(13.5);
    expect(split.other).toEqual([{ name: "Soliton", hours: 40 }]);
  });

  it("counts a task whose goal is gone as not for a goal", () => {
    const split = goalSplit([{ name: "Old", target_hours: 3, goal_id: "deleted" }], titleOf);
    expect(split.byGoal).toEqual([]);
    expect(split.otherHours).toBe(3);
  });
});
