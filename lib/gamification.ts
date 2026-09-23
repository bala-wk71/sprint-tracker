import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  DEFAULT_WEEK_START_DAY,
  addDaysIso,
  type WeekStartDay,
} from "@/lib/week";

type Client = SupabaseClient<Database>;

// ----------------------------------------------------------------------
// XP awards
// ----------------------------------------------------------------------

export const XP = {
  morning_checkin: 10,
  evening_wrapup: 15,
  priority_done: 10,
  perfect_day: 20,
  sprint_created: 20,
  weekly_reflection: 30,
  weekly_target_hit: 25,
  // Was 5 and uncapped, which is what let the notes page alone carry an
  // account to level 6 without a single tracked day. See DAILY_AWARD_CAP.
  todo_done: 3,
  // Health. Logging a weigh-in is worth less than a workout because it costs
  // one number, but it is worth something: the trend line is useless with
  // gaps in it, and the point of the XP is to keep the habit daily.
  workout_logged: 20,
  weight_logged: 5,
  water_goal: 10,
  protein_goal: 10,
  meal_logged: 3,
  // Once a day however many entries — the point is the habit of writing,
  // not the volume.
  journal_entry: 10,
  // Goals. Creating one earns nothing — it is too easy to repeat — and
  // letting one go costs nothing either.
  goal_checkin: 10,
  goal_step: 15,
  goal_done: 50,
  // Craft. A rigor run is worth more than any single tracking action because
  // it is the most expensive thing on this list to do honestly — twenty-one
  // boxes you have to actually be able to defend. Reading a foundation topic
  // pays once, ever, via a dedupe key on the slug.
  rigor_run: 25,
  foundation_read: 15,
} as const;

// Time logging XP accrues with hours logged, capped per day — logging many
// tiny entries earns no more than logging the same time in one entry.
export const TIME_LOG_XP_PER_HOUR = 1;
export const TIME_LOG_XP_DAILY_CAP = 10;

export type XpReason = keyof typeof XP;

/**
 * Awards that only pay out on a day the user actually tracked.
 *
 * These are worth real XP but none of them is itself an act of tracking: you
 * can tick todos, tick off goal steps and plan a sprint all week without ever
 * recording how a single day went. They pay nothing on an untracked day, and
 * nothing is banked — log the day first, then tick things off.
 *
 * `priority_done` is deliberately absent: priorities live inside the daily log
 * and completing one already requires a wrap-up, so it is gated by
 * construction. The check-in, wrap-up, time, health and journal awards are the
 * tracking itself and can never be gated on it.
 */
const TRACKED_DAY_ONLY: ReadonlySet<XpReason> = new Set<XpReason>([
  "todo_done",
  "rigor_run",
  "goal_step",
  "goal_checkin",
  "goal_done",
  "sprint_created",
]);

/**
 * Most XP a single reason can earn in one day. Absent means uncapped, which is
 * safe only where the action is naturally bounded (one check-in a day, one
 * wrap-up, one weekly reflection).
 */
export const DAILY_AWARD_CAP: Partial<Record<XpReason, number>> = {
  // 5 todos a day is a real day's list; beyond that the page is a notepad,
  // and a notepad should not out-earn tracking your day.
  todo_done: 5,
  goal_step: 2,
  goal_checkin: 3,
  // Three honest rigor runs is a full day's work. Beyond that the boxes are
  // being ticked rather than checked, and this stops paying.
  rigor_run: 3,
};

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
  dedupeKey: string,
  earnedOn?: string
): Promise<number> {
  try {
    const { error } = await supabase.from("xp_events").insert({
      owner_id: ownerId,
      amount: XP[reason],
      reason,
      dedupe_key: `${reason}:${dedupeKey}`,
      // Omitted rather than null when the caller has no date to hand: the
      // column defaults to current_date, which is only wrong for the handful
      // of legacy callers that don't know the user's local day.
      ...(earnedOn ? { earned_on: earnedOn } : {}),
    });
    return error ? 0 : XP[reason];
  } catch {
    return 0;
  }
}

/**
 * Award that pays out only on a day the user tracked, and only while that
 * day is under this reason's daily cap.
 *
 * Both checks fail closed to "no XP", never to an error: as with awardXp, a
 * gamification problem must not break the action the user actually took. The
 * underlying todo still ticks, the goal step still completes.
 *
 * `date` is the user's local day (todayIsoLocal()), not a UTC date — an IST
 * evening and the UTC date it falls in are different days.
 */
export async function awardTrackedXp(
  supabase: Client,
  ownerId: string,
  reason: XpReason,
  dedupeKey: string,
  date: string
): Promise<number> {
  try {
    if (TRACKED_DAY_ONLY.has(reason)) {
      const { data: tracked, error } = await supabase.rpc("day_is_tracked", {
        d: date,
      });
      if (error || !tracked) return 0;
    }

    const cap = DAILY_AWARD_CAP[reason];
    if (cap !== undefined) {
      const { count, error } = await supabase
        .from("xp_events")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", ownerId)
        .eq("reason", reason)
        .eq("earned_on", date);
      if (error) return 0;
      if ((count ?? 0) >= cap) return 0;
    }

    return await awardXp(supabase, ownerId, reason, dedupeKey, date);
  } catch {
    return 0;
  }
}

/**
 * Whether a gated award would pay out right now — for UI that wants to say
 * "log your day to start earning again" instead of silently granting nothing.
 */
export async function dayIsTracked(
  supabase: Client,
  date: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("day_is_tracked", { d: date });
    return error ? false : Boolean(data);
  } catch {
    return false;
  }
}

/**
 * Award time-logging XP for a day, proportional to total hours logged that
 * day (1 XP/hour) and capped at TIME_LOG_XP_DAILY_CAP. Awards only the delta
 * over what the day has already earned, so re-saves, edits, and many small
 * entries never over-award. The dedupe key encodes the running total, making
 * each top-up idempotent. Returns the XP granted by this call.
 */
export async function awardTimeLogXp(
  supabase: Client,
  ownerId: string,
  date: string,
  dayHoursLogged: number
): Promise<number> {
  try {
    const target = Math.min(
      TIME_LOG_XP_DAILY_CAP,
      Math.floor(Math.max(dayHoursLogged, 0) * TIME_LOG_XP_PER_HOUR)
    );
    if (target <= 0) return 0;

    const { data: prior, error: priorError } = await supabase
      .from("xp_events")
      .select("amount")
      .eq("owner_id", ownerId)
      .like("dedupe_key", `time_entry:day:${date}:%`);

    if (priorError) return 0;

    const already = (prior ?? []).reduce((sum, e) => sum + (e.amount ?? 0), 0);
    const delta = target - already;
    if (delta <= 0) return 0;

    const { error } = await supabase.from("xp_events").insert({
      owner_id: ownerId,
      amount: delta,
      reason: "time_entry",
      dedupe_key: `time_entry:day:${date}:${target}`,
      earned_on: date,
    });
    return error ? 0 : delta;
  } catch {
    return 0;
  }
}

// ----------------------------------------------------------------------
// Weekly XP wagers
// ----------------------------------------------------------------------

/** Stake choices offered when placing a wager. */
export const WAGER_PRESETS = [25, 50, 100] as const;

/** A won wager pays the stake back plus this profit on top. */
export function wagerProfit(stake: number): number {
  return Math.ceil(stake / 2);
}

/** Total XP credited on a win (the escrowed stake plus profit). */
export function wagerPayout(stake: number): number {
  return stake + wagerProfit(stake);
}

/**
 * Wagers can only be placed on Monday or Tuesday of the week being wagered —
 * staking on a week that's already mostly logged would be free XP.
 */
export function wagerPlacementOpen(weekStart: string, todayIso: string): boolean {
  return todayIso === weekStart || todayIso === addDays(weekStart, 1);
}

export type WagerOutcome = "pending" | "won" | "lost";

/**
 * Judge a wager week from log history. Lost as soon as any fully elapsed day
 * of the week has no log (today stays forgivable until it's over, matching
 * the streak rules); won once all 7 days are logged; pending otherwise.
 */
export function wagerOutcome(
  loggedDates: string[],
  weekStart: string,
  todayIso: string
): WagerOutcome {
  const logged = new Set(loggedDates);
  for (let i = 0; i < 7; i++) {
    const day = addDays(weekStart, i);
    if (logged.has(day)) continue;
    return day >= todayIso ? "pending" : "lost";
  }
  return "won";
}

// ----------------------------------------------------------------------
// XP decay
// ----------------------------------------------------------------------

/**
 * The day every balance was zeroed. Decay never reaches back past it — the
 * ledger before it describes an economy that no longer exists.
 */
export const XP_RESET_DATE = "2026-09-16";

/** Untracked days forgiven at the start of every gap. */
export const XP_DECAY_GRACE_DAYS = 2;
/** Share of the running total each charged day costs. */
export const XP_DECAY_RATE = 0.02;
/** Floor on a single day's charge, so small balances still feel it. */
export const XP_DECAY_MIN = 5;
/**
 * How far back a first run will reach. Someone returning after a year away
 * should not be met with 300 decay rows and a wiped balance — the point is to
 * keep the recent record honest, not to punish the whole absence.
 */
export const XP_DECAY_LOOKBACK_DAYS = 90;

export type XpDecayCharge = { date: string; amount: number };

export type XpDecayPlan = {
  /** Days that need a new negative ledger row, oldest first. */
  charges: XpDecayCharge[];
  /** Total once these charges land. */
  totalAfter: number;
};

/**
 * Work out what an inactive stretch costs.
 *
 * Percentage of the running total rather than a flat rate, so it scales with
 * what there is to lose: a Lighthouse account bleeds real points while a
 * beginner barely notices. It compounds day by day and clamps at zero, so a
 * long absence erodes the balance without ever wiping it.
 *
 * Pure and idempotent. `chargedDates` are days that already have a decay row;
 * they are skipped rather than recomputed, because `totalXp` is the current
 * total and so already reflects them. Re-running with the rows from a previous
 * run produces no new charges.
 *
 * Today is never charged — it isn't over yet, matching the rule
 * computeShieldedStreak() already applies to the streak.
 */
export function planXpDecay({
  trackedDates,
  todayIso,
  totalXp,
  chargedDates,
  notBefore,
}: {
  trackedDates: string[];
  todayIso: string;
  totalXp: number;
  chargedDates: string[];
  /** Never charge days before this — the XP reset, for the first run. */
  notBefore: string;
}): XpDecayPlan {
  const tracked = new Set(trackedDates);
  const charged = new Set(chargedDates);

  // An account that has never tracked anything has nothing to bleed. Without
  // this, a new user who signs up and looks around would start losing XP
  // before they had a chance to log their first day.
  if (tracked.size === 0) return { charges: [], totalAfter: totalXp };

  const first = [...trackedDates].sort()[0];
  const yesterday = addDays(todayIso, -1);
  const lookbackStart = addDays(todayIso, -XP_DECAY_LOOKBACK_DAYS);
  const earliest = notBefore > lookbackStart ? notBefore : lookbackStart;

  const charges: XpDecayCharge[] = [];
  let running = totalXp;
  let gap = 0;

  // The walk starts at the first tracked day rather than at `earliest` so the
  // gap counter is correct: a gap that began before the chargeable window
  // still counts towards the grace period.
  for (let d = first; d <= yesterday; d = addDays(d, 1)) {
    if (tracked.has(d)) {
      gap = 0;
      continue;
    }
    gap++;
    if (gap <= XP_DECAY_GRACE_DAYS) continue;
    if (d < earliest) continue;
    if (charged.has(d)) continue;
    if (running <= 0) continue;

    const amount = Math.min(
      running,
      Math.max(XP_DECAY_MIN, Math.round(running * XP_DECAY_RATE))
    );
    charges.push({ date: d, amount });
    running -= amount;
  }

  return { charges, totalAfter: running };
}

/**
 * How many days in a row, ending yesterday, went untracked. 0 when yesterday
 * was tracked. Drives the dashboard warning, so someone can be told the bleed
 * is coming rather than only discovering it afterwards.
 */
export function untrackedRun(trackedDates: string[], todayIso: string): number {
  if (trackedDates.length === 0) return 0;
  const tracked = new Set(trackedDates);
  // Tracking today ends the gap as far as the warning is concerned. Decay
  // itself still charges the days already missed — this only answers "should
  // we be nagging them right now", and the answer is no.
  if (tracked.has(todayIso)) return 0;

  const first = [...trackedDates].sort()[0];
  let run = 0;
  // Stopping at the first tracked day keeps the count to the account's own
  // history rather than the beginning of time.
  for (let d = addDays(todayIso, -1); d >= first; d = addDays(d, -1)) {
    if (tracked.has(d)) break;
    run++;
  }
  return run;
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

// Day stepping must format the way it parses (local, not UTC): a helper that
// parsed local midnight and formatted with toISOString() stood still on +1 in
// any timezone ahead of UTC, which spun the streak walk below forever.
const addDays = addDaysIso;

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
  // --- Health -----------------------------------------------------------
  {
    id: "first-workout",
    title: "Under the Bar",
    description: "Log your first workout.",
    icon: "Dumbbell",
  },
  {
    id: "workouts-10",
    title: "Showing Up",
    description: "Log 10 workouts.",
    icon: "Flame",
  },
  {
    id: "workouts-50",
    title: "Committed",
    description: "Log 50 workouts.",
    icon: "Medal",
  },
  {
    id: "workouts-100",
    title: "Century of Sessions",
    description: "Log 100 workouts.",
    icon: "Trophy",
  },
  {
    id: "workout-streak-4",
    title: "Four in a Row",
    description: "Train four days running.",
    icon: "Zap",
  },
  {
    id: "sets-500",
    title: "Volume Merchant",
    description: "Log 500 working sets.",
    icon: "Layers",
  },
  {
    id: "water-30",
    title: "Well Watered",
    description: "Hit your water goal on 30 days.",
    icon: "Droplet",
  },
  {
    id: "weigh-ins-90",
    title: "The Trend Line",
    description: "Log 90 weigh-ins — enough to see past the noise.",
    icon: "Scale",
  },
  {
    id: "food-30",
    title: "Kept the Books",
    description: "Log what you ate on 30 days.",
    icon: "UtensilsCrossed",
  },
  // --- Journal & goals --------------------------------------------------
  {
    id: "first-journal",
    title: "First Page",
    description: "Write your first journal entry.",
    icon: "PenLine",
  },
  {
    id: "journal-10",
    title: "Ten Pages",
    description: "Write 10 journal entries.",
    icon: "NotebookPen",
  },
  {
    id: "journal-50",
    title: "Keeping the Record",
    description: "Write 50 journal entries.",
    icon: "BookOpen",
  },
  {
    id: "journal-150",
    title: "The Archive",
    description: "Write 150 journal entries.",
    icon: "Library",
  },
  {
    id: "checkins-12",
    title: "Kept Checking In",
    description: "Check in on your goals 12 times.",
    icon: "CalendarClock",
  },
  {
    id: "goals-done-1",
    title: "Finisher",
    description: "Finish your first goal.",
    icon: "Flag",
  },
  {
    id: "goals-done-5",
    title: "Five Crossed Off",
    description: "Finish 5 goals.",
    icon: "FlagTriangleRight",
  },
  {
    id: "goals-done-10",
    title: "Summit Collector",
    description: "Finish 10 goals.",
    icon: "MountainSnow",
  },
  {
    id: "long-view",
    title: "The Long View",
    description:
      "Keep a goal of a year or more going, with check-ins spread across six months.",
    icon: "Telescope",
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
  // Health counters, optional so a stale RPC response stays safe to read.
  workouts_total?: number;
  workout_dates?: string[];
  working_sets_total?: number;
  water_goal_days?: number;
  weigh_in_count?: number;
  food_days?: number;
  // Journal & goal counters (stats v4), optional for the same reason.
  journal_entries_count?: number;
  checkins_count?: number;
  goals_done?: number;
  long_view_goals?: number;
  /**
   * Every date the user recorded something about that day (stats v5) — the
   * set form of day_is_tracked(). Optional so a stale RPC response stays safe
   * to read; an absent value simply means no decay is computed that render.
   */
  tracked_dates?: string[];
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

/** True if any full sprint week, on the user's calendar, has all 7 days logged. */
export function hasPerfectWeek(
  sortedDates: string[],
  weekStartDay: WeekStartDay = DEFAULT_WEEK_START_DAY
): boolean {
  const logged = new Set(sortedDates);
  for (const d of sortedDates) {
    const date = new Date(`${d}T00:00:00`);
    if (date.getDay() !== weekStartDay) continue; // only check from week starts
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
  totalXp = 0,
  weekStartDay: WeekStartDay = DEFAULT_WEEK_START_DAY
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
  if (hasPerfectWeek(dates, weekStartDay)) ids.push("perfect-week");

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

  const workouts = stats.workouts_total ?? 0;
  if (workouts >= 1) ids.push("first-workout");
  if (workouts >= 10) ids.push("workouts-10");
  if (workouts >= 50) ids.push("workouts-50");
  if (workouts >= 100) ids.push("workouts-100");

  // Reuses the same run counter as the daily-log streak, on training dates.
  if (longestRun([...(stats.workout_dates ?? [])].sort()) >= 4)
    ids.push("workout-streak-4");

  if ((stats.working_sets_total ?? 0) >= 500) ids.push("sets-500");
  if ((stats.water_goal_days ?? 0) >= 30) ids.push("water-30");
  if ((stats.weigh_in_count ?? 0) >= 90) ids.push("weigh-ins-90");
  if ((stats.food_days ?? 0) >= 30) ids.push("food-30");

  const journalEntries = stats.journal_entries_count ?? 0;
  if (journalEntries >= 1) ids.push("first-journal");
  if (journalEntries >= 10) ids.push("journal-10");
  if (journalEntries >= 50) ids.push("journal-50");
  if (journalEntries >= 150) ids.push("journal-150");
  if ((stats.checkins_count ?? 0) >= 12) ids.push("checkins-12");

  const goalsDone = stats.goals_done ?? 0;
  if (goalsDone >= 1) ids.push("goals-done-1");
  if (goalsDone >= 5) ids.push("goals-done-5");
  if (goalsDone >= 10) ids.push("goals-done-10");
  // The six-month span is measured in SQL; any one qualifying goal is enough.
  if ((stats.long_view_goals ?? 0) >= 1) ids.push("long-view");

  if (level >= 5) ids.push("level-5");
  if (level >= 10) ids.push("level-10");

  return ids;
}
