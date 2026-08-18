// ---------------------------------------------------------------------------
// Signal / Noise task categories
//
// Four categories are one 2x2 over two independent questions:
//
//                     do I know how to start?
//                        yes          no
//   worth my week   Sharp Signal   Fuzzy Signal
//   not really      Sharp Noise    Fuzzy Noise
//
//   signal / noise  is VALUE   — is this worth the week?
//   sharp  / fuzzy  is CLARITY — can you see the first move?
//
// The old names for the clarity axis were "strong" and "weak", which read as
// importance rather than clarity: "Strong Noise" sounded like the worst
// quadrant when it is the third, and "Weak Noise" — the one to delete —
// sounded like the mildest. "Clear" was unavailable as its replacement,
// because LEVEL_TITLES already spends it on level 5.
//
// The enum values in Postgres are unchanged, so these are display names only.
// `personal` deliberately sits off the grid: it is not low-value work, it is a
// fixed cost you are protecting, and the signal ratio excludes it.
// ---------------------------------------------------------------------------

export const TASK_CATEGORIES = {
  strong_signal: {
    label: "Sharp Signal",
    color: "strong-signal",
    priority: "Do first",
    description: "Worth it, and you know your first move.",
    example: "Ship the feature you have already scoped.",
  },
  weak_signal: {
    label: "Fuzzy Signal",
    color: "weak-signal",
    priority: "Do second",
    description: "Worth it, but you cannot see the path yet.",
    example: "Work out why retention drops in week two.",
  },
  strong_noise: {
    label: "Sharp Noise",
    color: "strong-noise",
    priority: "Limit",
    description: "Easy and obligatory, but it moves little.",
    example: "Status decks, expense claims, the standing sync.",
  },
  weak_noise: {
    label: "Fuzzy Noise",
    color: "weak-noise",
    priority: "Eliminate",
    description: "Vague, unowned, and not worth it.",
    example: "The meeting with no agenda.",
  },
  personal: {
    label: "Personal",
    color: "personal",
    priority: "Protect",
    description: "A fixed cost you are choosing to keep.",
    example: "Gym, commute, family, sleep.",
  },
} as const;

export type TaskCategory = keyof typeof TASK_CATEGORIES;

/**
 * The 2x2 as the picker draws it: axis headings, then rows of cells. Kept
 * beside the categories so a label and the grid it sits in cannot drift.
 */
export const CATEGORY_GRID = {
  clarityAxis: { label: "Do I know how to start?", yes: "Yes", no: "Not sure" },
  valueAxis: { label: "Is it worth my week?", yes: "Worth it", no: "Not really" },
  rows: [
    { value: "yes", cells: ["strong_signal", "weak_signal"] },
    { value: "no", cells: ["strong_noise", "weak_noise"] },
  ],
  /** Off the grid, offered beside it. */
  aside: "personal",
} as const satisfies {
  clarityAxis: { label: string; yes: string; no: string };
  valueAxis: { label: string; yes: string; no: string };
  rows: readonly { value: "yes" | "no"; cells: readonly TaskCategory[] }[];
  aside: TaskCategory;
};

/**
 * Stack and legend order everywhere: the action ladder, then the fixed cost,
 * then whatever was never tagged. The colours escalate along it — see the
 * --viz-* block in globals.css.
 */
export const CATEGORY_ORDER = [
  "strong_signal",
  "weak_signal",
  "strong_noise",
  "weak_noise",
  "personal",
] as const satisfies readonly TaskCategory[];

// Morning Moods
export const MORNING_MOODS = [
  { value: "energised", emoji: "😊", label: "Energised" },
  { value: "neutral", emoji: "😐", label: "Neutral" },
  { value: "tired", emoji: "😴", label: "Tired" },
  { value: "stressed", emoji: "😟", label: "Stressed" },
  { value: "pumped", emoji: "🔥", label: "Pumped" },
] as const;

export type MorningMood = (typeof MORNING_MOODS)[number]["value"];

// Evening Moods
export const EVENING_MOODS = [
  { value: "accomplished", emoji: "😊", label: "Accomplished" },
  { value: "okay", emoji: "😐", label: "Okay" },
  { value: "exhausted", emoji: "😴", label: "Exhausted" },
  { value: "frustrated", emoji: "😟", label: "Frustrated" },
  { value: "proud", emoji: "🔥", label: "Proud" },
] as const;

export type EveningMood = (typeof EVENING_MOODS)[number]["value"];

// Priority Status
export const PRIORITY_STATUSES = [
  { value: "pending", emoji: "⏳", label: "Pending" },
  { value: "done", emoji: "✅", label: "Done" },
  { value: "partial", emoji: "🔄", label: "Partial" },
  { value: "missed", emoji: "❌", label: "Missed" },
] as const;

export type PriorityStatus = (typeof PRIORITY_STATUSES)[number]["value"];

// Task Status
export const TASK_STATUSES = [
  "active",
  "completed",
  "abandoned",
  "archived",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

// Invite Types
export const INVITE_TYPES = ["owner", "reviewer"] as const;
export type InviteType = (typeof INVITE_TYPES)[number];

// Invite Statuses
export const INVITE_STATUSES = [
  "pending",
  "accepted",
  "expired",
  "revoked",
] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];

// AI Assistant
export const AI_USER_ID = "00000000-0000-0000-0000-000000000001";

// Navigation items
export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/sprint/setup", label: "Sprint Setup", icon: "ListTodo" },
  { href: "/daily", label: "Daily Log", icon: "CalendarDays" },
  { href: "/analytics", label: "Analytics", icon: "BarChart3" },
  { href: "/review", label: "Reviewing", icon: "Users" },
  { href: "/todo", label: "Todo", icon: "CheckSquare" },
  { href: "/notes", label: "Notes", icon: "NotebookPen" },
  { href: "/assistant", label: "Assistant", icon: "Bot" },
  { href: "/settings", label: "Settings", icon: "Settings" },
] as const;

// Total hours a week has to offer — hard ceiling for sprint planning
export const WEEK_HOURS = 168;

// Max invite count for regular users
export const MAX_INVITES = 5;

// Intention character limit
export const INTENTION_MAX_LENGTH = 280;
