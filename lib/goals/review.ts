/** How a coach review reads, in words and colour. Client-safe. */
export const REVIEW_DIRECTIONS = {
  forward: {
    label: "Moving forward",
    tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  steady: { label: "Holding steady", tone: "bg-primary/10 text-primary" },
  slipping: {
    label: "Slipping",
    tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  unclear: { label: "Not enough to go on", tone: "bg-muted text-muted-foreground" },
} as const;

export type ReviewDirection = keyof typeof REVIEW_DIRECTIONS;

export function directionOf(value: string) {
  return REVIEW_DIRECTIONS[value as ReviewDirection] ?? REVIEW_DIRECTIONS.unclear;
}

export type ReviewReason = { text: string; dates?: string | null };

/** Reasons come back from a jsonb column, so read them defensively. */
export function reasonsOf(value: unknown): ReviewReason[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    item && typeof item === "object" && typeof (item as ReviewReason).text === "string"
      ? [{ text: (item as ReviewReason).text, dates: (item as ReviewReason).dates ?? null }]
      : []
  );
}

export type SavedGoalReview = {
  id: string;
  direction: string;
  summary: string;
  reasons: unknown;
  next_step: string;
  input_counts: unknown;
  read_journal: boolean;
  created_at: string;
};

/** "6 check-ins, 11.5h logged, 3 of 7 steps" from the saved counts. */
export function lookedAtLabel(counts: unknown): string {
  if (!counts || typeof counts !== "object") return "";
  const c = counts as Record<string, number | undefined>;
  const parts: string[] = [];
  if (c.checkins !== undefined) parts.push(`${c.checkins} ${c.checkins === 1 ? "check-in" : "check-ins"}`);
  if (c.hours) parts.push(`${c.hours}h logged`);
  if (c.steps_total) parts.push(`${c.steps_done ?? 0} of ${c.steps_total} steps`);
  if (c.notes_read) parts.push(`${c.notes_read} notes read`);
  return parts.join(", ");
}
