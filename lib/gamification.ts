import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

// ----------------------------------------------------------------------
// XP awards
// ----------------------------------------------------------------------

export const XP = {
  morning_checkin: 10,
  time_entry: 5,
  evening_wrapup: 15,
  priority_done: 10,
  perfect_day: 20,
  sprint_created: 20,
  weekly_reflection: 30,
  weekly_target_hit: 25,
} as const;

export type XpReason = keyof typeof XP;

/**
 * Idempotent XP award: the (owner, dedupe_key) unique constraint means a
 * retried or re-saved action never double-awards. Failures are swallowed —
 * gamification must never break the underlying action.
 * Returns the amount awarded (0 if it was already awarded or on error).
 */
export async function awardXp(
  supabase: Client,
  ownerId: string,
  reason: XpReason,
  dedupeKey: string
): Promise<number> {
  try {
    const { error } = await supabase.from("xp_events").insert({
      owner_id: ownerId,
      amount: XP[reason],
      reason,
      dedupe_key: `${reason}:${dedupeKey}`,
    });
    return error ? 0 : XP[reason];
  } catch {
    return 0;
  }
}

// ----------------------------------------------------------------------
// Levels
// ----------------------------------------------------------------------

export const LEVEL_TITLES = [
  "Static", // 1
  "Faint Signal", // 2
  "Emerging Signal", // 3
  "Steady Signal", // 4
  "Clear Signal", // 5
  "Strong Signal", // 6
  "Focused Signal", // 7
  "Amplified Signal", // 8
  "Pure Signal", // 9
  "Beacon", // 10+
] as const;

/** Total XP required to *reach* a level (level 1 = 0). */
export function xpThreshold(level: number): number {
  return 75 * (level - 1) * level;
}

export type LevelInfo = {
  level: number;
  title: string;
  totalXp: number;
  /** XP earned within the current level. */
  progress: number;
  /** XP needed to go from this level to the next. */
  span: number;
};

export function levelFromXp(totalXp: number): LevelInfo {
  let level = 1;
  while (totalXp >= xpThreshold(level + 1)) level++;
  const base = xpThreshold(level);
  const next = xpThreshold(level + 1);
  const title =
    level <= LEVEL_TITLES.length
      ? LEVEL_TITLES[level - 1]
      : `Beacon ${"I".repeat(Math.min(3, level - LEVEL_TITLES.length))}+`;
  return {
    level,
    title,
    totalXp,
    progress: totalXp - base,
    span: next - base,
  };
}

// ----------------------------------------------------------------------
// Shielded daily streak
// ----------------------------------------------------------------------

export type ShieldedStreak = {
  current: number;
  shields: number;
  lastActiveDate: string | null;
};

const MAX_SHIELDS = 3;

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Streak with protection: every 7 consecutive logged days banks a shield
 * (max 3); a missed day consumes one instead of resetting the streak.
 * Purely derived from log history — no state to store or corrupt.
 */
export function computeShieldedStreak(
  loggedDates: string[],
  todayIso: string
): ShieldedStreak {
  if (loggedDates.length === 0) {
    return { current: 0, shields: 0, lastActiveDate: null };
  }
  const logged = new Set(loggedDates);
  const sorted = [...loggedDates].sort();
  const first = sorted[0];
  const lastActive = sorted[sorted.length - 1];

  let run = 0;
  let bank = 0;
  for (let d = first; d <= todayIso; d = addDays(d, 1)) {
    if (logged.has(d)) {
      run++;
      if (run % 7 === 0) bank = Math.min(MAX_SHIELDS, bank + 1);
    } else if (d !== todayIso) {
      // Today doesn't count against you until it's over.
      if (run > 0 && bank > 0) {
        bank--;
      } else {
        run = 0;
      }
    }
  }

  return {
    current: run,
    shields: bank,
    lastActiveDate: run > 0 ? lastActive : null,
  };
}

// ----------------------------------------------------------------------
// Achievements
// ----------------------------------------------------------------------

export type AchievementDef = {
  id: string;
  title: string;
  description: string;
  /** lucide-react icon name, resolved in the UI. */
  icon: string;
};

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first-log",
    title: "First Step",
    description: "Log your first day.",
    icon: "Footprints",
  },
  {
    id: "first-sprint",
    title: "The Planner",
    description: "Create your first weekly sprint.",
    icon: "ClipboardList",
  },
  {
    id: "streak-7",
    title: "One Week Strong",
    description: "Reach a 7-day streak.",
    icon: "Flame",
  },
  {
    id: "streak-30",
    title: "Iron Month",
    description: "Reach a 30-day streak.",
    icon: "Medal",
  },
  {
    id: "hours-100",
    title: "Century of Focus",
    description: "Log 100 hours of tracked time.",
    icon: "Hourglass",
  },
  {
    id: "hours-500",
    title: "Deep Work Master",
    description: "Log 500 hours of tracked time.",
    icon: "Gem",
  },
  {
    id: "priorities-50",
    title: "Prioritizer",
    description: "Complete 50 daily priorities.",
    icon: "ListChecks",
  },
  {
    id: "perfect-week",
    title: "Perfect Week",
    description: "Log all 7 days of a single week.",
    icon: "CalendarCheck",
  },
  {
    id: "comeback",
    title: "The Comeback",
    description: "Return and log a day after a week away. What matters is coming back.",
    icon: "Undo2",
  },
  {
    id: "reflect-4",
    title: "Self-Aware",
    description: "Write 4 weekly reflections.",
    icon: "BookOpenCheck",
  },
];

export type GamificationStats = {
  log_dates: string[];
  total_hours: number;
  priorities_done: number;
  sprints_count: number;
  reflections_count: number;
};

/** Longest run of consecutive dates (no shields — raw discipline). */
export function longestRun(sortedDates: string[]): number {
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sortedDates) {
    run = prev !== null && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/** True if any Mon–Sun week has all 7 days logged. */
export function hasPerfectWeek(sortedDates: string[]): boolean {
  const logged = new Set(sortedDates);
  for (const d of sortedDates) {
    const date = new Date(`${d}T00:00:00`);
    const day = date.getDay(); // 0=Sun .. 6=Sat
    if ((day === 0 ? 7 : day) !== 1) continue; // only check from Mondays
    let full = true;
    for (let i = 1; i < 7; i++) {
      if (!logged.has(addDays(d, i))) {
        full = false;
        break;
      }
    }
    if (full) return true;
  }
  return false;
}

/** True if some log follows a gap of 7+ days after the previous one. */
export function hasComeback(sortedDates: string[]): boolean {
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(`${sortedDates[i - 1]}T00:00:00`).getTime();
    const cur = new Date(`${sortedDates[i]}T00:00:00`).getTime();
    if ((cur - prev) / 86_400_000 >= 8) return true;
  }
  return false;
}

/** Which achievement ids the given stats qualify for. */
export function earnedAchievementIds(stats: GamificationStats): string[] {
  const dates = [...stats.log_dates].sort();
  const ids: string[] = [];
  if (dates.length >= 1) ids.push("first-log");
  if (stats.sprints_count >= 1) ids.push("first-sprint");
  if (longestRun(dates) >= 7) ids.push("streak-7");
  if (longestRun(dates) >= 30) ids.push("streak-30");
  if (stats.total_hours >= 100) ids.push("hours-100");
  if (stats.total_hours >= 500) ids.push("hours-500");
  if (stats.priorities_done >= 50) ids.push("priorities-50");
  if (hasPerfectWeek(dates)) ids.push("perfect-week");
  if (hasComeback(dates)) ids.push("comeback");
  if (stats.reflections_count >= 4) ids.push("reflect-4");
  return ids;
}
