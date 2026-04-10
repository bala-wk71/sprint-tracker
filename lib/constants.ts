// Signal/Noise Task Categories
export const TASK_CATEGORIES = {
  strong_signal: {
    label: "Strong Signal",
    emoji: "🟢",
    color: "strong-signal",
    priority: "First",
    description: "High value + clear path",
  },
  weak_signal: {
    label: "Weak Signal",
    emoji: "🟡",
    color: "weak-signal",
    priority: "Second",
    description: "Valuable but unclear",
  },
  strong_noise: {
    label: "Strong Noise",
    emoji: "🔴",
    color: "strong-noise",
    priority: "Limit",
    description: "Clear but low value",
  },
  weak_noise: {
    label: "Weak Noise",
    emoji: "🟣",
    color: "weak-noise",
    priority: "Eliminate",
    description: "Low value + unclear",
  },
  personal: {
    label: "Personal",
    emoji: "🔵",
    color: "personal",
    priority: "Fixed",
    description: "Life essentials",
  },
} as const;

export type TaskCategory = keyof typeof TASK_CATEGORIES;

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

// Navigation items
export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/sprint/setup", label: "Sprint Setup", icon: "ListTodo" },
  { href: "/daily", label: "Daily Log", icon: "CalendarDays" },
  { href: "/analytics", label: "Analytics", icon: "BarChart3" },
  { href: "/review", label: "Reviewing", icon: "Users" },
  { href: "/settings", label: "Settings", icon: "Settings" },
] as const;

// Max invite count for regular users
export const MAX_INVITES = 5;

// Intention character limit
export const INTENTION_MAX_LENGTH = 280;
