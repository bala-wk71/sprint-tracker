/**
 * The rigor checklist — a short list to tick off before a feature ships.
 *
 * Two stages: frame the work before building it, and check it before it
 * leaves your machine. It is scaffolding for a habit, not a process to live
 * inside, so it stays short: an item earns its place by catching something
 * you would otherwise miss, and drops out once it is reflex.
 *
 * The template lives here rather than in the database on purpose. Runs store
 * only the ids they ticked, so editing this list never rewrites history.
 */

export type ChecklistItem = {
  /** Stable id. Never reuse one for different wording. */
  id: string;
  text: string;
  /** Shown under the item when it needs a nudge rather than a rule. */
  hint?: string;
};

export type ChecklistStage = {
  id: string;
  title: string;
  /** When in the task this stage applies. */
  when: string;
  items: ChecklistItem[];
};

export const CHECKLIST: ChecklistStage[] = [
  {
    id: "frame",
    title: "Frame it",
    when: "Before you build",
    items: [
      {
        id: "f1",
        text: "I can state the problem in one sentence, and say what “done” looks like.",
      },
      {
        id: "f2",
        text: "I know which files this touches and how data flows through them.",
        hint: "Read them. Not skim — read, and follow one value end to end.",
      },
      {
        id: "f3",
        text: "I listed the edge cases: empty, duplicate, invalid, concurrent, slow, dependency down.",
      },
      {
        id: "f4",
        text: "I sketched my own approach first — even three lines — before asking the AI.",
        hint: "This is the only way you find out whether your judgment is improving.",
      },
      {
        id: "f5",
        text: "I named what must not change.",
      },
      {
        id: "f6",
        text: "This is small enough to review in one sitting. If not, I split it.",
      },
    ],
  },
  {
    id: "ship",
    title: "Before you ship",
    when: "Before you push",
    items: [
      {
        id: "d1",
        text: "I can explain every line. Anything I couldn't, I looked up or asked about.",
      },
      {
        id: "d2",
        text: "No unrelated changes, dead code, or leftover debug output slipped in.",
      },
      {
        id: "s1",
        text: "Tests cover the happy path and at least one failure path, and they pass.",
      },
      {
        id: "s2",
        text: "I ran it myself and watched it work — not just the tests.",
      },
    ],
  },
];

/** Every item id in the current template, in order. */
export const CHECKLIST_ITEM_IDS: string[] = CHECKLIST.flatMap((stage) =>
  stage.items.map((item) => item.id)
);

export const CHECKLIST_TOTAL = CHECKLIST_ITEM_IDS.length;

export type Ticks = Record<string, boolean>;

/** Ticks that still correspond to a live template item. */
export function tickedCount(ticks: Ticks): number {
  return CHECKLIST_ITEM_IDS.reduce((n, id) => (ticks[id] ? n + 1 : n), 0);
}

export function isComplete(ticks: Ticks): boolean {
  return tickedCount(ticks) === CHECKLIST_TOTAL;
}
