// Prompts for the written plan reports: monthly report, quarterly review
// (which also proposes next quarter's projects) and yearly review. The
// numbers arrive already computed; the model writes the words.

import { z } from "zod";
import type { ResponseSchema } from "./gemini";

export type WrittenPeriod = "month" | "quarter" | "year";

const STREAM_WORDS = {
  type: "object",
  properties: {
    name: { type: "string", description: "The stream's name exactly as given" },
    summary: { type: "string" },
    nextFocus: { type: "string" },
  },
  required: ["name", "summary", "nextFocus"],
};

const PROPOSAL_ITEM = {
  type: "object",
  properties: {
    ref: { type: "string", description: "The destination's ref, e.g. D1" },
    title: { type: "string" },
    projects: { type: "array", items: { type: "string" } },
    why: { type: "string" },
  },
  required: ["ref", "title", "projects"],
};

export function reportResponseSchema(period: WrittenPeriod): ResponseSchema {
  return {
    type: "object",
    properties: {
      headline: { type: "string" },
      streams: { type: "array", items: STREAM_WORDS },
      nextFocus: { type: "string" },
      ...(period === "quarter" ? { proposal: { type: "array", items: PROPOSAL_ITEM } } : {}),
    },
    required: ["headline", "streams", "nextFocus"],
  };
}

/**
 * Report fields are single paragraphs, yet the model sometimes returns a
 * line break where it meant "–" or "₹" (seen as "89\n90 kg", "up \n13,000").
 * Money in plans is always rupees and ranges always use an en dash, so each
 * break is put back as the character it replaced, or else a space.
 */
export function repairGlyphs(value: string): string {
  return value
    .replace(/(\d)[ \t]*\n[ \t]*(\d)/g, "$1–$2")
    .replace(/\n(?=\d)/g, "₹")
    .replace(/\s*\n\s*/g, " ");
}

const text = (max: number) => z.string().transform(repairGlyphs).pipe(z.string().trim().min(1).max(max));
const optionalText = (max: number) => z.string().transform(repairGlyphs).pipe(z.string().trim().max(max)).catch("");

export const reportWordsSchema = z.object({
  headline: text(400),
  streams: z
    .array(z.object({ name: text(80), summary: text(1500), nextFocus: optionalText(400) }))
    .max(20)
    .catch([]),
  nextFocus: optionalText(400),
});

export type ReportWords = z.output<typeof reportWordsSchema>;

export const proposalSchema = z
  .array(
    z.object({
      ref: z.string().trim().min(1).max(10),
      title: text(120),
      projects: z
        .array(z.unknown())
        .max(6)
        .catch([])
        .transform((items) =>
          items.flatMap((s) => (typeof s === "string" && s.trim() ? [repairGlyphs(s).trim().slice(0, 200)] : []))
        ),
      why: optionalText(300),
    })
  )
  .max(12)
  .catch([]);

const SHARED = `You write a person's plan report from numbers the app has already worked out. Every report answers three questions: where am I against the plan, what moved it, and what's next.

Rules:
- Use only the numbers given, quoted as written. Never do your own arithmetic, never invent a figure, a cause or an event.
- Lead with what was done and distance covered ("2.1 kg down, 40% of the way"), then where it stands on the path.
- Never write "behind", "failed" or "missed". A gap is "catching up", always with one concrete way back: name a weekly action from the numbers (its target, or its minimum for a hard stretch).
- "What moved it" lines are the evidence for what helps; use them when present. Without one, don't claim a cause.
- "Improving" means better than their own previous four weeks, even if still short of the path.
- If a forecast says moving the date is worth offering, say so plainly and kindly: the path can change, the goal stays.
- Plain, warm, specific. Write like a sharp friend who read the numbers, not a coach doing a pep talk. No headings, no emoji, no bullet lists inside summaries.

The numbers are shown right beside your words, so interpret them rather than recite them: pick the two or three that matter most and say what they mean. Don't list every figure.

Output:
- headline: one specific sentence on the whole period, with its most telling number (not "a few areas to focus on").
- streams: one entry per stream in the numbers, same names, same order. summary: 2–4 sentences, under 70 words. nextFocus: one concrete action for the coming period, or "" if there's nothing to add.
- nextFocus: the single most useful thing across everything, one sentence.`;

const BY_PERIOD: Record<WrittenPeriod, string> = {
  month: `This is the monthly report. nextFocus looks at next month.`,
  quarter: `This is the quarterly review. For each stream, say which checkpoints and quarter projects were reached and what made the difference. nextFocus looks at next quarter.

Then propose next quarter's projects in proposal: one entry per destination listed under "Next quarter" that has a path or open work, using its ref. title names the quarter and the number the path asks for at the quarter's end (e.g. "Q4 2026: weight to 91–92 kg"). projects: 1–3 concrete pieces of work that move it, each a plain action someone can finish within the quarter, not a habit (habits are weekly actions, which already exist). Carry over unfinished steps that still matter instead of inventing new ones. Skip a destination when nothing useful fits. why: one line.`,
  year: `This is the yearly review. For each target with a checkpoint this year, say whether it was reached. Apply the person's own rule: a year-end target beaten → suggest pulling next year's target forward; a target not reached this year AND at the checkpoint before → suggest rethinking that path (the plan, never the person). Mention steps and projects finished during the year. nextFocus looks at next year.`,
};

export function getReportPrompt(period: WrittenPeriod): string {
  return `${SHARED}\n\n${BY_PERIOD[period]}`;
}
