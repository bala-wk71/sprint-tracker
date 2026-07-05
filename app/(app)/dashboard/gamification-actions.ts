"use server";

import { createClient, getUser } from "@/lib/supabase/server";
import {
  earnedAchievementIds,
  type GamificationStats,
} from "@/lib/gamification";

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
  const newlyUnlocked = earnedAchievementIds(stats, Number(totalXp ?? 0)).filter(
    (id) => !existing.has(id)
  );

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
