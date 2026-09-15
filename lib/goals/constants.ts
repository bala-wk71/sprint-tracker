import { addDays, addMonths, differenceInCalendarDays, format } from "date-fns";

export const GOAL_AREAS = [
  { value: "work", label: "Work", dot: "bg-sky-500" },
  { value: "health", label: "Health", dot: "bg-emerald-500" },
  { value: "money", label: "Money", dot: "bg-amber-500" },
  { value: "people", label: "People", dot: "bg-rose-500" },
  { value: "learning", label: "Learning", dot: "bg-violet-500" },
  { value: "self", label: "Self", dot: "bg-teal-500" },
] as const;

export const GOAL_AREA_VALUES = ["work", "health", "money", "people", "learning", "self"] as const;
export type GoalArea = (typeof GOAL_AREA_VALUES)[number];

export function goalArea(value: string) {
  return GOAL_AREAS.find((a) => a.value === value) ?? GOAL_AREAS[5];
}

/** Preset lengths. "custom" means the user picked the end date themselves. */
export const GOAL_HORIZONS = [
  { value: "1w", label: "1 week", days: 7 },
  { value: "2w", label: "2 weeks", days: 14 },
  { value: "1m", label: "1 month", months: 1 },
  { value: "3m", label: "3 months", months: 3 },
  { value: "6m", label: "6 months", months: 6 },
  { value: "1y", label: "1 year", months: 12 },
  { value: "3y", label: "3 years", months: 36 },
  { value: "5y", label: "5 years", months: 60 },
  { value: "10y", label: "10 years", months: 120 },
] as const;

export const GOAL_HORIZON_VALUES = ["1w", "2w", "1m", "3m", "6m", "1y", "3y", "5y", "10y", "custom"] as const;
export type GoalHorizon = (typeof GOAL_HORIZON_VALUES)[number];

export function horizonLabel(horizon: string, startIso: string, targetIso: string) {
  const preset = GOAL_HORIZONS.find((h) => h.value === horizon);
  if (preset) return preset.label;
  const days = lengthInDays(startIso, targetIso);
  if (days < 60) return `${Math.max(1, Math.round(days / 7))} weeks`;
  if (days < 730) return `${Math.round(days / 30.4)} months`;
  return `${Math.round(days / 365)} years`;
}

export function targetDateFor(horizon: GoalHorizon, startIso: string): string | null {
  const preset = GOAL_HORIZONS.find((h) => h.value === horizon);
  if (!preset) return null;
  const start = new Date(`${startIso}T00:00:00`);
  const end = "days" in preset ? addDays(start, preset.days) : addMonths(start, preset.months);
  return format(end, "yyyy-MM-dd");
}

export function lengthInDays(startIso: string, targetIso: string) {
  return differenceInCalendarDays(
    new Date(`${targetIso}T00:00:00`),
    new Date(`${startIso}T00:00:00`)
  );
}

/** The longer the goal, the less often it asks for a check-in. */
export function defaultCheckinDays(lengthDays: number): number {
  if (lengthDays <= 31) return 3;
  if (lengthDays <= 92) return 7;
  if (lengthDays <= 366) return 14;
  return 30;
}

export const CHECKIN_OPTIONS = [
  { days: 3, label: "Every 3 days" },
  { days: 7, label: "Every week" },
  { days: 14, label: "Every 2 weeks" },
  { days: 30, label: "Every month" },
  { days: 90, label: "Every 3 months" },
] as const;

export const TRACK_TYPES = [
  { value: "steps", label: "Steps", hint: "A checklist of milestones. Good for projects." },
  { value: "number", label: "A number", hint: "Where you started, where you want to be, and where you are now." },
  { value: "feeling", label: "A feeling", hint: "For things you can't count. Rate how on track you feel, 1 to 10." },
] as const;

export const TRACK_TYPE_VALUES = ["steps", "number", "feeling"] as const;
export type TrackType = (typeof TRACK_TYPE_VALUES)[number];

export const GOAL_STATUSES = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "done", label: "Done" },
  { value: "let_go", label: "Let go" },
] as const;

export type GoalStatus = (typeof GOAL_STATUSES)[number]["value"];

/** Beyond this many active goals the form mentions it — a nudge, never a block. */
export const ACTIVE_GOAL_SOFT_LIMIT = 5;

/** Goals longer than this ask for a smaller first step. */
export const BIG_GOAL_DAYS = 366;
