"use server";

import { createClient, getUser } from "@/lib/supabase/server";
import {
  earnedAchievementIds,
  planXpDecay,
  untrackedRun,
  XP_DECAY_GRACE_DAYS,
  XP_RESET_DATE,
  type GamificationStats,
} from "@/lib/gamification";
import { getWeekStartDay, todayIsoLocal } from "@/lib/dates";

/**
 * Recomputes achievements from history and persists any new unlocks.
 * Called from the dashboard on mount so past activity (including data from
 * before gamification existed) is honoured. Returns newly unlocked ids.
 */
export async function syncAchievements(): Promise<{ newlyUnlocked: string[] }> {
  const user = await getUser();
  if (!user) return { newlyUnlocked: [] };

  const supabase = await createClient();
  const [{ data: statsRaw }, { data: existingRows }, { data: totalXp }] =
    await Promise.all([
      supabase.rpc("gamification_stats"),
      supabase.from("user_achievements").select("achievement_id"),
      supabase.rpc("total_xp"),
    ]);
  if (!statsRaw) return { newlyUnlocked: [] };

  const stats = statsRaw as unknown as GamificationStats;
  const existing = new Set(
    (existingRows ?? []).map((r) => r.achievement_id)
  );
  const newlyUnlocked = earnedAchievementIds(
    stats,
    Number(totalXp ?? 0),
    await getWeekStartDay()
  ).filter((id) => !existing.has(id));

  if (newlyUnlocked.length > 0) {
    await supabase.from("user_achievements").insert(
      newlyUnlocked.map((id) => ({
        owner_id: user.id,
        achievement_id: id,
      }))
    );
  }

  return { newlyUnlocked };
}

// ----------------------------------------------------------------------
// XP decay
// ----------------------------------------------------------------------

export type XpDecayResult = {
  /** XP removed by this call (0 when nothing was owed). */
  applied: number;
  /** Days charged by this call. */
  days: number;
  /** Total XP after any charges. */
  totalXp: number;
  /** Consecutive untracked days ending yesterday, for the warning banner. */
  untrackedDays: number;
  /** Untracked days still forgiven before the next one costs anything. */
  graceLeft: number;
};

const EMPTY_DECAY: XpDecayResult = {
  applied: 0,
  days: 0,
  totalXp: 0,
  untrackedDays: 0,
  graceLeft: XP_DECAY_GRACE_DAYS,
};

/**
 * Charge XP for days the user recorded nothing, and report where they stand.
 *
 * Called on dashboard mount alongside resolveWagers(), so the bleed is settled
 * lazily on the next visit rather than needing a scheduled job. One negative
 * ledger row per untracked day, dedupe key `decay:<date>` — the unique index
 * makes a concurrent or repeated run a no-op, and the ledger stays append-only
 * exactly as wager stakes do.
 *
 * Failures return zeros rather than throwing: as everywhere else in
 * gamification, this must never be what breaks the dashboard.
 */
export async function applyXpDecay(): Promise<XpDecayResult> {
  const user = await getUser();
  if (!user) return EMPTY_DECAY;

  try {
    const supabase = await createClient();
    const todayIso = await todayIsoLocal();

    const [{ data: statsRaw }, { data: totalXpRaw }, { data: decayRows }] =
      await Promise.all([
        supabase.rpc("gamification_stats"),
        supabase.rpc("total_xp"),
        supabase
          .from("xp_events")
          .select("earned_on")
          .eq("owner_id", user.id)
          .eq("reason", "decay"),
      ]);

    if (!statsRaw) return EMPTY_DECAY;

    const stats = statsRaw as unknown as GamificationStats;
    const trackedDates = stats.tracked_dates ?? [];
    const totalXp = Number(totalXpRaw ?? 0);

    const { charges, totalAfter } = planXpDecay({
      trackedDates,
      todayIso,
      totalXp,
      chargedDates: (decayRows ?? []).map((r) => r.earned_on),
      notBefore: XP_RESET_DATE,
    });

    if (charges.length > 0) {
      // A dedupe conflict here means a concurrent mount already charged these
      // days; the insert is rejected wholesale and the next visit re-reads the
      // ledger, so there is nothing to repair.
      await supabase.from("xp_events").insert(
        charges.map((c) => ({
          owner_id: user.id,
          amount: -c.amount,
          reason: "decay",
          dedupe_key: `decay:${c.date}`,
          earned_on: c.date,
        }))
      );
    }

    const untrackedDays = untrackedRun(trackedDates, todayIso);

    return {
      applied: totalXp - totalAfter,
      days: charges.length,
      totalXp: totalAfter,
      untrackedDays,
      graceLeft: Math.max(0, XP_DECAY_GRACE_DAYS - untrackedDays),
    };
  } catch {
    return EMPTY_DECAY;
  }
}
