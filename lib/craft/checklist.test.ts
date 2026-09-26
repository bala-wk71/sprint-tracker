import { describe, expect, it } from "vitest";
import {
  CHECKLIST,
  CHECKLIST_ITEM_IDS,
  CHECKLIST_TOTAL,
  isComplete,
  tickedCount,
} from "./checklist";

/**
 * The checklist is hand-written data whose item ids are stored in craft_runs
 * rows, so a duplicate or a renamed id is invisible in review and wrong in
 * production.
 */
describe("rigor checklist", () => {
  it("has unique item ids", () => {
    expect(new Set(CHECKLIST_ITEM_IDS).size).toBe(CHECKLIST_ITEM_IDS.length);
  });

  it("has unique stage ids", () => {
    const ids = CHECKLIST.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every stage and item the text the panel renders", () => {
    for (const stage of CHECKLIST) {
      expect(stage.title.length, stage.id).toBeGreaterThan(0);
      expect(stage.when.length, stage.id).toBeGreaterThan(0);
      expect(stage.items.length, stage.id).toBeGreaterThan(0);
      for (const item of stage.items) {
        expect(item.text.length, item.id).toBeGreaterThan(0);
      }
    }
  });

  it("counts every stage's items in the total", () => {
    const summed = CHECKLIST.reduce((n, stage) => n + stage.items.length, 0);
    expect(CHECKLIST_TOTAL).toBe(summed);
  });

  it("ignores ticks for items no longer in the template", () => {
    // Editing the template must not retroactively complete an old run.
    expect(tickedCount({ "gone-from-template": true })).toBe(0);
    expect(isComplete({ "gone-from-template": true })).toBe(false);
  });

  it("only completes when every live item is ticked", () => {
    const all = Object.fromEntries(CHECKLIST_ITEM_IDS.map((id) => [id, true]));
    expect(isComplete(all)).toBe(true);

    const oneShort = { ...all };
    delete oneShort[CHECKLIST_ITEM_IDS[0]];
    expect(isComplete(oneShort)).toBe(false);
    expect(tickedCount(oneShort)).toBe(CHECKLIST_TOTAL - 1);
  });

  it("does not count a box that was ticked and then unticked", () => {
    expect(tickedCount({ [CHECKLIST_ITEM_IDS[0]]: false })).toBe(0);
  });
});
