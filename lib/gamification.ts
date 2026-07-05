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
  todo_done: 5,
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
  "Beacon", // 10
  "Radiant Beacon", // 11
  "Lighthouse", // 12
] as const;

/**
 * Total XP required to *reach* a level (level 1 = 0). Each level costs 150 XP
 * more than the previous one: L2 at 150, L3 at 450, L4 at 900, …
 */
export function xpThreshold(level: number): number {
  return 75 * (level - 1) * level;
}

function roman(n: number): string {
  const table: Array<[number, string]> = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  for (const [v, s] of table) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return out;
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

/** Levels are unbounded: past "Lighthouse" they continue as Lighthouse II, III, … */
export function levelFromXp(totalXp: number): LevelInfo {
  let level = 1;
  while (totalXp >= xpThreshold(level + 1)) level++;
  const base = xpThreshold(level);
  const next = xpThreshold(level + 1);
  const title =
    level <= LEVEL_TITLES.length
      ? LEVEL_TITLES[level - 1]
      : `Lighthouse ${roman(level - LEVEL_TITLES.length + 1)}`;
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
  // --- Showing up -------------------------------------------------------
  {
    id: "first-log",
    title: "First Step",
    description: "Log your first day.",
    icon: "Footprints",
  },
  {
    id: "logs-30",
    title: "Thirty Days In",
    description: "Log 30 days in total.",
    icon: "CalendarDays",
  },
  {
    id: "logs-100",
    title: "The Long Game",
    description: "Log 100 days in total.",
    icon: "Award",
  },
  {
    id: "comeback",
    title: "The Comeback",
    description: "Return and log a day after a week away. What matters is coming back.",
    icon: "Undo2",
  },
  // --- Streaks ----------------------------------------------------------
  {
    id: "streak-3",
    title: "Warming Up",
    description: "Log 3 days in a row.",
    icon: "Sprout",
  },
  {
    id: "streak-7",
    title: "One Week Strong",
    description: "Reach a 7-day streak.",
    icon: "Flame",
  },
  {
    id: "streak-14",
    title: "Fortnight Focus",
    description: "Reach a 14-day streak.",
    icon: "Zap",
  },
  {
    id: "streak-30",
    title: "Iron Month",
    description: "Reach a 30-day streak.",
    icon: "Medal",
  },
  {
    id: "streak-60",
    title: "Unstoppable",
    description: "Reach a 60-day streak.",
    icon: "Mountain",
  },
  {
    id: "streak-100",
    title: "Century Streak",
    description: "Reach a 100-day streak.",
    icon: "Crown",
  },
  {
    id: "perfect-week",
    title: "Perfect Week",
    description: "Log all 7 days of a single week.",
    icon: "CalendarCheck",
  },
  // --- Hours ------------------------------------------------------------
  {
    id: "hours-10",
    title: "Ten Hours Deep",
    description: "Log 10 hours of tracked time.",
    icon: "Timer",
  },
  {
    id: "hours-50",
    title: "Finding Rhythm",
    description: "Log 50 hours of tracked time.",
    icon: "Waves",
  },
  {
    id: "hours-100",
    title: "Century of Focus",
    description: "Log 100 hours of tracked time.",
    icon: "Hourglass",
  },
  {
    id: "hours-250",
    title: "Deep Worker",
    description: "Log 250 hours of tracked time.",
    icon: "Anchor",
  },
  {
    id: "hours-500",
    title: "Deep Work Master",
    description: "Log 500 hours of tracked time.",
    icon: "Gem",
  },
  {
    id: "hours-1000",
    title: "Thousand Hour Club",
    description: "Log 1,000 hours of tracked time.",
    icon: "Rocket",
  },
  // --- Priorities & perfect days ----------------------------------------
  {
    id: "priorities-10",
    title: "Getting Things Done",
    description: "Complete 10 daily priorities.",
    icon: "CheckCheck",
  },
  {
    id: "priorities-50",
    title: "Prioritizer",
    description: "Complete 50 daily priorities.",
    icon: "ListChecks",
  },
  {
    id: "priorities-150",
    title: "Priority Machine",
    description: "Complete 150 daily priorities.",
    icon: "Target",
  },
  {
    id: "perfect-1",
    title: "Full Circle",
    description: "Complete a perfect day: check-in, time logged, and wrap-up.",
    icon: "BadgeCheck",
  },
  {
    id: "perfect-10",
    title: "Ten Perfect Days",
    description: "Complete 10 perfect days.",
    icon: "Star",
  },
  {
    id: "perfect-30",
    title: "Perfection Habit",
    description: "Complete 30 perfect days.",
    icon: "Sun",
  },
  // --- Todos ------------------------------------------------------------
  {
    id: "todos-10",
    title: "List Crusher",
    description: "Complete 10 todos.",
    icon: "CheckSquare",
  },
  {
    id: "todos-50",
    title: "Todo Terminator",
    description: "Complete 50 todos.",
    icon: "Trophy",
  },
  // --- Planning & reflection --------------------------------------------
  {
    id: "first-sprint",
    title: "The Planner",
    description: "Create your first weekly sprint.",
    icon: "ClipboardList",
  },
  {
    id: "sprints-5",
    title: "Serial Planner",
    description: "Plan 5 weekly sprints.",
    icon: "Repeat",
  },
  {
    id: "sprints-12",
    title: "Quarter Master",
    description: "Plan 12 weekly sprints — a full quarter.",
    icon: "Compass",
  },
  {
    id: "reflect-4",
    title: "Self-Aware",
    description: "Write 4 weekly reflections.",
    icon: "BookOpenCheck",
  },
  {
    id: "reflect-12",
    title: "Deep Thinker",
    description: "Write 12 weekly reflections.",
    icon: "Brain",
  },
  // --- Levels -----------------------------------------------------------
  {
    id: "level-5",
    title: "Clear Signal",
    description: "Reach level 5.",
    icon: "Radio",
  },
  {
    id: "level-10",
    title: "Beacon",
    description: "Reach level 10.",
    icon: "Sparkles",
  },
];

export type GamificationStats = {
  log_dates: string[];
  total_hours: number;
  priorities_done: number;
  sprints_count: number;
  reflections_count: number;
  perfect_days?: number;
  todos_done?: number;
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
export function earnedAchievementIds(
  stats: GamificationStats,
  totalXp = 0
): string[] {
  const dates = [...stats.log_dates].sort();
  const run = longestRun(dates);
  const perfectDays = stats.perfect_days ?? 0;
  const todosDone = stats.todos_done ?? 0;
  const level = levelFromXp(totalXp).level;
  const ids: string[] = [];

  if (dates.length >= 1) ids.push("first-log");
  if (dates.length >= 30) ids.push("logs-30");
  if (dates.length >= 100) ids.push("logs-100");
  if (hasComeback(dates)) ids.push("comeback");

  if (run >= 3) ids.push("streak-3");
  if (run >= 7) ids.push("streak-7");
  if (run >= 14) ids.push("streak-14");
  if (run >= 30) ids.push("streak-30");
  if (run >= 60) ids.push("streak-60");
  if (run >= 100) ids.push("streak-100");
  if (hasPerfectWeek(dates)) ids.push("perfect-week");

  if (stats.total_hours >= 10) ids.push("hours-10");
  if (stats.total_hours >= 50) ids.push("hours-50");
  if (stats.total_hours >= 100) ids.push("hours-100");
  if (stats.total_hours >= 250) ids.push("hours-250");
  if (stats.total_hours >= 500) ids.push("hours-500");
  if (stats.total_hours >= 1000) ids.push("hours-1000");

  if (stats.priorities_done >= 10) ids.push("priorities-10");
  if (stats.priorities_done >= 50) ids.push("priorities-50");
  if (stats.priorities_done >= 150) ids.push("priorities-150");
  if (perfectDays >= 1) ids.push("perfect-1");
  if (perfectDays >= 10) ids.push("perfect-10");
  if (perfectDays >= 30) ids.push("perfect-30");

  if (todosDone >= 10) ids.push("todos-10");
  if (todosDone >= 50) ids.push("todos-50");

  if (stats.sprints_count >= 1) ids.push("first-sprint");
  if (stats.sprints_count >= 5) ids.push("sprints-5");
  if (stats.sprints_count >= 12) ids.push("sprints-12");
  if (stats.reflections_count >= 4) ids.push("reflect-4");
  if (stats.reflections_count >= 12) ids.push("reflect-12");

  if (level >= 5) ids.push("level-5");
  if (level >= 10) ids.push("level-10");

  return ids;
}
