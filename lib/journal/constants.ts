// Journal moods run best → worst so the coach can read them as a trend.
// Emoji is fine here: a mood picker is expressive, not chrome.
export const JOURNAL_MOODS = [
  { value: "great", emoji: "😄", label: "Great" },
  { value: "good", emoji: "🙂", label: "Good" },
  { value: "okay", emoji: "😐", label: "Okay" },
  { value: "low", emoji: "😔", label: "Low" },
  { value: "rough", emoji: "😣", label: "Rough" },
] as const;

export const JOURNAL_MOOD_VALUES = ["great", "good", "okay", "low", "rough"] as const;
export type JournalMood = (typeof JOURNAL_MOOD_VALUES)[number];

export function toJournalMood(value: string | null | undefined): JournalMood | null {
  return (JOURNAL_MOOD_VALUES as readonly string[]).includes(value ?? "")
    ? (value as JournalMood)
    : null;
}

/** Shown as the empty page's placeholder, one at a time, so a blank box never stalls you. */
export const JOURNAL_PROMPTS = [
  "What's taking up space in your head?",
  "What went better than you expected lately?",
  "What would you tell yourself a year ago?",
  "What are you avoiding, and why?",
  "What did this month teach you?",
  "Who made your week better?",
  "What do you want more of next month?",
  "What's one thing you'd do differently this week?",
] as const;

export const TIMELINE_FILTERS = [
  { value: "all", label: "All" },
  { value: "journal", label: "Journal" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
] as const;

export type TimelineFilter = (typeof TIMELINE_FILTERS)[number]["value"];

export function toTimelineFilter(value: string | undefined): TimelineFilter {
  return TIMELINE_FILTERS.some((f) => f.value === value)
    ? (value as TimelineFilter)
    : "all";
}
