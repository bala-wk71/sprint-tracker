import { z } from "zod";
import type { ResponseSchema } from "./gemini";

/** Shape Gemini is pinned to when extracting action items. */
export const ACTION_ITEMS_RESPONSE_SCHEMA: ResponseSchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          owner: { type: "string", enum: ["me", "other"] },
          owner_name: { type: "string" },
          due_date: { type: "string" },
          source_quote: { type: "string" },
          confidence: { type: "string", enum: ["high", "low"] },
        },
        required: ["title", "owner", "confidence"],
      },
    },
  },
  required: ["items"],
};

/**
 * Deliberately forgiving: a missing or empty optional field is normal, and a
 * date the model invented in the wrong format should drop the date rather
 * than throw the whole extraction away.
 */
export const actionItemsResultSchema = z.object({
  items: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(500),
        owner: z.enum(["me", "other"]).catch("other"),
        owner_name: z.string().trim().max(200).optional().nullable(),
        due_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .nullable()
          .catch(null),
        source_quote: z.string().trim().max(1000).optional().nullable(),
        confidence: z.enum(["high", "low"]).catch("low"),
      })
    )
    .max(50),
});

export type ExtractedActionItem = z.infer<
  typeof actionItemsResultSchema
>["items"][number];

export function getExtractionPrompt(userName: string, today: string): string {
  return `You extract action items from a person's meeting notes.

The person reading these notes is ${userName}. Today is ${today}.

Rules:
- Return only genuine commitments — something a person agreed to do. Ignore
  background discussion, opinions, and things that were merely mentioned.
- Set owner to "me" when the commitment belongs to ${userName}, and "other"
  when it belongs to someone else. Put that person's name in owner_name.
- Write each title as a short imperative task ("Send the pricing deck to
  Priya"), not as a quote.
- Resolve relative dates against today and return due_date as YYYY-MM-DD.
  Omit due_date entirely when no deadline was stated — never guess one.
- source_quote must be text that actually appears in the notes or transcript.
- Use confidence "low" when you are inferring rather than reading a clear
  commitment.
- Do not repeat anything listed under "Already tracked".
- If there are no action items, return an empty list.`;
}

export function getEnhancePrompt(userName: string, today: string): string {
  return `You clean up ${userName}'s rough meeting notes. Today is ${today}.

Rules:
- Preserve every point the person wrote. Never drop one, and never contradict one.
- "I", "I'll" and "I said I'd" are ${userName}. Their own commitments are the
  ones they most need back, so list them under Action items alongside everyone
  else's, attributed to ${userName} by name — never omit them, and never leave
  Action items holding only other people's work.
- Add detail only where the transcript supports it. If there is no transcript,
  restructure and clarify what is already there — do not invent facts,
  numbers, names, or decisions.
- Organise under these markdown headings, omitting any that would be empty:
  ## Context, ## Decisions, ## Open questions, ## Action items, ## Notes
- Keep the person's own wording where it is already clear.
- Write plain markdown: headings, bullets, bold. No preamble, no sign-off,
  no commentary about the notes themselves.
- Stay factual and neutral in tone regardless of any persona instructions.`;
}

/** The note, its place in the page tree, and what is already tracked. */
export function buildPageContext(input: {
  path: string[];
  title: string;
  kind: string;
  meetingDate: string | null;
  attendees: string | null;
  body: string;
  transcript: string | null;
  existingItems: string[];
}): string {
  const sections: string[] = [];

  if (input.path.length > 0)
    sections.push(`Project path: ${input.path.join(" > ")}`);
  sections.push(`Page: ${input.title} (${input.kind})`);
  if (input.meetingDate) sections.push(`Meeting date: ${input.meetingDate}`);
  if (input.attendees) sections.push(`Attendees: ${input.attendees}`);

  sections.push(`\n## Notes\n${input.body.trim() || "(empty)"}`);

  if (input.transcript?.trim())
    sections.push(`\n## Transcript\n${input.transcript.trim()}`);

  if (input.existingItems.length > 0) {
    sections.push(`\n## Already tracked (do not repeat)`);
    for (const item of input.existingItems) sections.push(`- ${item}`);
  }

  return sections.join("\n");
}
