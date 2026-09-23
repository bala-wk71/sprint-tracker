import { describe, expect, it } from "vitest";
import {
  ALL_TOPICS,
  TRACKS,
  minutesRemaining,
  nextTopic,
  readCount,
  topicBySlug,
  trackOf,
  type ReadingMap,
} from "./curriculum";
import {
  CHECKLIST,
  CHECKLIST_ITEM_IDS,
  CHECKLIST_TOTAL,
  isComplete,
  stageProgress,
  tickedCount,
} from "./checklist";

/**
 * The curriculum and the checklist are hand-written data, not generated, and
 * both are keyed by slugs and ids that other tables point at. A duplicate or a
 * stray asterisk is invisible in review and obvious in production, so it gets
 * checked here instead.
 */

const read = (...slugs: string[]): ReadingMap =>
  Object.fromEntries(
    slugs.map((slug) => [
      slug,
      { topic_slug: slug, status: "read" as const, notes: null, read_at: null },
    ])
  );

describe("curriculum data", () => {
  it("has unique topic slugs", () => {
    const slugs = ALL_TOPICS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("has unique track slugs", () => {
    const slugs = TRACKS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("uses url-safe slugs that fit the column", () => {
    for (const topic of ALL_TOPICS) {
      expect(topic.slug).toMatch(/^[a-z0-9-]{1,64}$/);
    }
  });

  it("gives every topic the sections the reader renders", () => {
    for (const topic of ALL_TOPICS) {
      expect(topic.title.length, topic.slug).toBeGreaterThan(0);
      expect(topic.hook.length, topic.slug).toBeGreaterThan(0);
      expect(topic.minutes, topic.slug).toBeGreaterThan(0);
      expect(topic.idea.length, topic.slug).toBeGreaterThan(200);
      expect(topic.bites.length, topic.slug).toBeGreaterThan(100);
      expect(topic.decisions.length, topic.slug).toBeGreaterThan(0);
      expect(topic.inYourCode.length, topic.slug).toBeGreaterThan(0);
      expect(topic.gotIt.length, topic.slug).toBeGreaterThan(0);
      expect(topic.deeper.length, topic.slug).toBeGreaterThan(0);
    }
  });

  it("resolves every topic back to its track", () => {
    for (const topic of ALL_TOPICS) {
      expect(topicBySlug(topic.slug), topic.slug).toBe(topic);
      expect(trackOf(topic.slug)?.topics, topic.slug).toContain(topic);
    }
  });

  it("keeps markdown delimiters balanced", () => {
    // The renderer in components/shared/Markdown pairs ** and ` with a regex;
    // an odd one leaves visible asterisks or backticks in the page.
    for (const topic of ALL_TOPICS) {
      for (const [name, body] of [
        ["idea", topic.idea],
        ["bites", topic.bites],
      ] as const) {
        const where = `${topic.slug}.${name}`;
        expect((body.match(/\*\*/g) ?? []).length % 2, where).toBe(0);
        expect((body.match(/`/g) ?? []).length % 2, where).toBe(0);
      }
    }
  });

  it("never nests an asterisk inside bold, which the renderer cannot parse", () => {
    for (const topic of ALL_TOPICS) {
      for (const match of topic.idea.match(/\*\*[^*]*\*\*/g) ?? []) {
        expect(match.slice(2, -2), topic.slug).not.toContain("*");
      }
    }
  });

  it("only links out over https", () => {
    for (const topic of ALL_TOPICS) {
      for (const link of topic.deeper) {
        if (link.url) expect(link.url, topic.slug).toMatch(/^https:\/\//);
      }
    }
  });
});

describe("reading progress", () => {
  it("counts nothing read on a fresh map", () => {
    expect(readCount({})).toBe(0);
    expect(nextTopic({})).toBe(ALL_TOPICS[0]);
  });

  it("skips read topics when choosing what is next", () => {
    const map = read(ALL_TOPICS[0].slug, ALL_TOPICS[1].slug);
    expect(readCount(map)).toBe(2);
    expect(nextTopic(map)).toBe(ALL_TOPICS[2]);
  });

  it("returns to a topic left in progress before starting a new one", () => {
    const map: ReadingMap = {
      ...read(ALL_TOPICS[0].slug),
      [ALL_TOPICS[4].slug]: {
        topic_slug: ALL_TOPICS[4].slug,
        status: "reading",
        notes: null,
        read_at: null,
      },
    };
    expect(nextTopic(map)).toBe(ALL_TOPICS[4]);
  });

  it("runs out of topics once everything is read", () => {
    const map = read(...ALL_TOPICS.map((t) => t.slug));
    expect(nextTopic(map)).toBeUndefined();
    expect(minutesRemaining(map)).toBe(0);
  });

  it("subtracts only what has been read from the time left", () => {
    const total = ALL_TOPICS.reduce((n, t) => n + t.minutes, 0);
    const map = read(ALL_TOPICS[0].slug);
    expect(minutesRemaining(map)).toBe(total - ALL_TOPICS[0].minutes);
  });
});

describe("rigor checklist", () => {
  it("has unique item ids", () => {
    expect(new Set(CHECKLIST_ITEM_IDS).size).toBe(CHECKLIST_ITEM_IDS.length);
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

  it("reports per-stage progress independently", () => {
    const first = CHECKLIST[0];
    const ticks = { [first.items[0].id]: true };
    expect(stageProgress(first, ticks)).toEqual({ done: 1, total: first.items.length });
    expect(stageProgress(CHECKLIST[1], ticks).done).toBe(0);
  });
});
