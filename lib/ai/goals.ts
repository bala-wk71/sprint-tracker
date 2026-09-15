import { z } from "zod";
import type { ResponseSchema } from "./gemini";
import { personaInstructions, type AiPersona } from "./prompts";

// ---------------------------------------------------------------------------
// "How am I doing?" — one goal, structured, saved for comparison.

export const GOAL_REVIEW_RESPONSE_SCHEMA: ResponseSchema = {
  type: "object",
  properties: {
    direction: { type: "string", enum: ["forward", "steady", "slipping", "unclear"] },
    summary: { type: "string" },
    reasons: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          dates: { type: "string" },
        },
        required: ["text"],
      },
    },
    next_step: { type: "string" },
  },
  required: ["direction", "summary", "reasons", "next_step"],
};

/** Forgiving on the optional parts: a missing date should cost the date, not the review. */
export const goalReviewResultSchema = z.object({
  direction: z.enum(["forward", "steady", "slipping", "unclear"]).catch("unclear"),
  summary: z.string().trim().min(1).max(2000),
  reasons: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(500),
        dates: z.string().trim().max(80).optional().nullable().catch(null),
      })
    )
    .max(5)
    .catch([]),
  next_step: z.string().trim().max(1000).catch(""),
});

export function getGoalReviewPrompt(persona: AiPersona, today: string, readJournal: boolean) {
  return `${personaInstructions(persona)}

You are reviewing one of the user's long-term goals and telling them, honestly,
whether they are moving toward it. Today is ${today}.

Pick the direction:
- "forward": the numbers, steps, ratings or logged work show real movement.
- "steady": there is activity, but no clear movement either way.
- "slipping": activity or ratings have dropped off, or the goal is falling
  behind its own timeline.
- "unclear": fewer than two check-ins and no linked work, so there is not
  enough to judge.

Rules:
- Give 2 or 3 reasons. Each must rest on data you were given. Put the dates it
  is based on in "dates" when you can, e.g. "2 Aug → 12 Sep".
- Never invent a number, a date or a quote.
- A gap in the log means the user did not record it, not that nothing happened.
- ${
    readJournal
      ? "You may quote a few words from their check-in notes when they explain a pattern, with the date."
      : "You cannot see anything they wrote, only numbers, steps, ratings and hours. Don't guess at their reasons or feelings."
  }
- "summary" is 1 or 2 sentences in your persona's voice.
- "next_step" is exactly one concrete thing to do this coming week. For
  "unclear", tell them what to log so the next review can judge.
- If a previous review is given, say whether things changed since then.
- Letting a goal go is a legitimate choice. Never shame it.`;
}

export type GoalReviewInput = {
  goal: {
    title: string;
    why: string;
    area: string;
    length: string;
    startDate: string;
    targetDate: string;
    status: string;
    trackType: string;
    startValue: number | null;
    targetValue: number | null;
    currentValue: number | null;
    unit: string | null;
  };
  steps: { title: string; doneAt: string | null }[];
  /** Newest first. `note` is null unless the user lets the coach read the journal. */
  checkins: { date: string; onTrack: number | null; value: number | null; note: string | null }[];
  hours: { total: number; last28: number; lastWorkedOn: string | null };
  linked: { tasks: number; todos: number; todosDone: number };
  previous: { date: string; direction: string; summary: string; nextStep: string } | null;
};

export function buildGoalReviewContext(i: GoalReviewInput): string {
  const g = i.goal;
  const unit = g.unit ? ` ${g.unit}` : "";
  const lines: string[] = [
    `Goal: ${g.title}`,
    g.why ? `Why it matters to them: ${g.why}` : "",
    `Area: ${g.area}. Length: ${g.length}, ${g.startDate} → ${g.targetDate}. Status: ${g.status}.`,
  ];

  if (g.trackType === "number") {
    lines.push(`Tracked by a number: started at ${g.startValue}${unit}, target ${g.targetValue}${unit}, now ${g.currentValue ?? g.startValue}${unit}.`);
  } else if (g.trackType === "steps") {
    const done = i.steps.filter((s) => s.doneAt);
    lines.push(`Tracked by steps: ${done.length} of ${i.steps.length} done.`);
    for (const s of i.steps) {
      lines.push(`- [${s.doneAt ? `done ${s.doneAt.slice(0, 10)}` : "not done"}] ${s.title}`);
    }
  } else {
    lines.push("Tracked by how on-track it feels (1–10 at each check-in).");
  }

  lines.push(
    `\nLogged work: ${i.hours.total}h in total, ${i.hours.last28}h in the last 28 days` +
      (i.hours.lastWorkedOn ? `, last on ${i.hours.lastWorkedOn}.` : ".") +
      ` Linked: ${i.linked.tasks} sprint tasks, ${i.linked.todos} todos (${i.linked.todosDone} done).`
  );

  lines.push(`\n## Check-ins (newest first, ${i.checkins.length})`);
  if (i.checkins.length === 0) lines.push("None yet.");
  for (const c of i.checkins) {
    const parts = [c.date];
    if (c.value !== null) parts.push(`value ${c.value}${unit}`);
    if (c.onTrack !== null) parts.push(`feels ${c.onTrack}/10`);
    if (c.note) parts.push(`note: "${c.note.replace(/\s+/g, " ").slice(0, 400)}"`);
    lines.push(`- ${parts.join("; ")}`);
  }

  if (i.previous) {
    lines.push(
      `\n## Previous review (${i.previous.date})`,
      `Direction: ${i.previous.direction}. ${i.previous.summary}`,
      i.previous.nextStep ? `Suggested then: ${i.previous.nextStep}` : ""
    );
  }

  return lines.filter(Boolean).join("\n");
}

// ---------------------------------------------------------------------------
// Monthly look-back — a short letter written into the journal.

export function getLookBackPrompt(persona: AiPersona, monthLabel: string) {
  return `${personaInstructions(persona)}

You are writing the user a short look-back letter about ${monthLabel}, from
their journal entries, goal check-ins and daily reflections.

Cover, in this order and only where there is something to say:
1. What kept coming up: themes that appear more than once. Quote a few of their
   words with the date.
2. How their mood moved across the month, from the mood labels given.
3. Wins they may have forgotten.
4. If a previous look-back is given, one sentence on what changed since then,
   for example a worry that shows up less often.
5. One question for them to think about next month.

Rules:
- Use only what is in the entries. Never invent an event, a feeling or a quote.
- Quote sparingly and exactly.
- Don't diagnose, and don't give medical or mental-health advice. If something
  sounds serious, gently suggest talking to someone they trust.
- With fewer than three entries, write a much shorter note and say that more
  entries will make next month's letter more useful.
- Plain markdown, around 150–300 words, no sign-off.`;
}

export type LookBackInput = {
  monthLabel: string;
  entries: { date: string; kind: string; mood: string | null; title: string; body: string; goalTitle: string | null; onTrack: number | null }[];
  reflections: { date: string; text: string }[];
  previousLetter: { date: string; body: string } | null;
};

export function buildLookBackContext(i: LookBackInput): string {
  const lines: string[] = [`Month: ${i.monthLabel}`, `\n## Journal entries and check-ins (${i.entries.length})`];
  for (const e of i.entries) {
    const head = [e.date, e.kind === "check_in" ? `check-in on "${e.goalTitle ?? "a goal"}"` : "journal"];
    if (e.mood) head.push(`mood: ${e.mood}`);
    if (e.onTrack !== null) head.push(`feels ${e.onTrack}/10`);
    lines.push(`- ${head.join("; ")}${e.title ? ` — ${e.title}` : ""}`);
    lines.push(`  ${e.body.replace(/\s+/g, " ").slice(0, 1200)}`);
  }

  if (i.reflections.length > 0) {
    lines.push(`\n## Daily reflections (${i.reflections.length})`);
    for (const r of i.reflections) lines.push(`- ${r.date}: ${r.text.replace(/\s+/g, " ").slice(0, 400)}`);
  }

  if (i.previousLetter) {
    lines.push(`\n## Previous look-back (${i.previousLetter.date})`, i.previousLetter.body.slice(0, 3000));
  }

  return lines.join("\n");
}
