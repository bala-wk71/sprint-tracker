/**
 * The rigor checklist — ticked once per task, every task.
 *
 * Four stages, in the order the work actually happens: frame the problem
 * before a single prompt, keep each prompt honest, read every line that comes
 * back, and prove it before it leaves your machine.
 *
 * The template lives here rather than in the database on purpose. It is meant
 * to be edited as you learn what you keep getting wrong — add an item the week
 * you ship a bug, drop one once it is reflex. Runs store only the ids they
 * ticked, so editing this list never rewrites history.
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
  why: string;
  items: ChecklistItem[];
};

export const CHECKLIST: ChecklistStage[] = [
  {
    id: "frame",
    title: "Frame it",
    when: "Before the first prompt",
    why: "Almost every bad change was decided before a line was written. This is the stage seniors spend longest on and juniors skip.",
    items: [
      {
        id: "f1",
        text: "I can state the problem in one sentence, and say what \u201cdone\u201d looks like.",
        hint: "If you can't, you are about to ask for code against a problem you haven't defined.",
      },
      {
        id: "f2",
        text: "I know which files this touches and how data flows through them.",
        hint: "Read them. Not skim \u2014 read, and follow one value end to end.",
      },
      {
        id: "f3",
        text: "I listed the edge cases: empty, duplicate, invalid, concurrent, slow, dependency down.",
        hint: "Write them down before you build. Afterwards you will only think of the ones you happened to hit.",
      },
      {
        id: "f4",
        text: "I sketched my own approach first \u2014 even three lines \u2014 before asking the AI.",
        hint: "This is the only way you find out whether your judgment is improving.",
      },
      {
        id: "f5",
        text: "I named what must not change.",
        hint: "Existing behaviour, public shapes, other callers, the data already in the table.",
      },
      {
        id: "f6",
        text: "This is small enough to review in one sitting. If not, I split it.",
      },
    ],
  },
  {
    id: "prompt",
    title: "Every prompt",
    when: "Each time you ask",
    why: "The model is only as good as the context and the constraints. A vague ask gets confident, plausible, wrong code.",
    items: [
      {
        id: "p1",
        text: "I gave the real context: the files, the conventions, the constraints \u2014 not just the ask.",
      },
      {
        id: "p2",
        text: "I asked for the plan first, and pushed back on it before any code was written.",
        hint: "Arguing with a plan is cheap. Arguing with 400 lines is not.",
      },
      {
        id: "p3",
        text: "One change at a time \u2014 I verified this step before asking for the next.",
      },
      {
        id: "p4",
        text: "I said explicitly what to leave alone.",
      },
    ],
  },
  {
    id: "diff",
    title: "Every line of the diff",
    when: "Before you stage anything",
    why: "Read it as if a stranger wrote it and you are on the hook for it \u2014 because you are. Authorship transferred the moment you accepted it.",
    items: [
      {
        id: "d1",
        text: "I can explain every line. Anything I couldn't, I looked up or asked about.",
        hint: "\u201cIt works\u201d is not an explanation. If one line is load-bearing and you don't know why, that is the bug.",
      },
      {
        id: "d2",
        text: "No unrelated changes, dead code, or leftover debug output slipped in.",
      },
      {
        id: "d3",
        text: "Errors are handled where they happen, not swallowed into an empty catch.",
      },
      {
        id: "d4",
        text: "Inputs are validated at the boundary. No secrets, keys or personal data exposed.",
      },
      {
        id: "d5",
        text: "It follows the patterns and naming already in this codebase, not a new style.",
      },
      {
        id: "d6",
        text: "I checked the data layer: right types, constraints, indexes, and a transaction where two writes must both land.",
        hint: "This is where AI-written code is weakest and where the damage lasts longest.",
      },
      {
        id: "d7",
        text: "I would defend every decision here in review, out loud, with my lead.",
      },
    ],
  },
  {
    id: "prove",
    title: "Prove it",
    when: "Before you push",
    why: "Proof beats confidence. Most of the gap between one year and five is how much someone insists on seeing for themselves.",
    items: [
      {
        id: "s1",
        text: "Tests cover the happy path and at least one failure path, and they pass.",
      },
      {
        id: "s2",
        text: "I ran it myself and watched it work \u2014 not just the tests.",
      },
      {
        id: "s3",
        text: "I read the whole diff once more, cold.",
      },
      {
        id: "s4",
        text: "I compared my own sketch with what got built, and logged anything surprising below.",
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

export function stageProgress(stage: ChecklistStage, ticks: Ticks) {
  const done = stage.items.reduce((n, item) => (ticks[item.id] ? n + 1 : n), 0);
  return { done, total: stage.items.length };
}
