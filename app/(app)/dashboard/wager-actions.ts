"use server";

import { createClient, getUser } from "@/lib/supabase/server";
import { mondayIsoOf, todayIsoLocal } from "@/lib/dates";
import {
  WAGER_PRESETS,
  wagerOutcome,
  wagerPayout,
  wagerPlacementOpen,
} from "@/lib/gamification";

export type PlaceWagerResult =
  | { ok: true; newTotalXp: number }
  | { ok: false; error: string };

/**
 * Stake XP on logging all 7 days of the current week. The stake is escrowed
 * immediately as a negative ledger entry; winning credits it back with profit.
 */
export async function placeWager(stake: number): Promise<PlaceWagerResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  if (!WAGER_PRESETS.includes(stake as (typeof WAGER_PRESETS)[number])) {
    return { ok: false, error: "Pick one of the offered stakes." };
  }

  const todayIso = await todayIsoLocal();
  const weekStart = mondayIsoOf(todayIso);
  if (!wagerPlacementOpen(weekStart, todayIso)) {
    return { ok: false, error: "Wagers can only be placed on Monday or Tuesday." };
  }

  const supabase = await createClient();
  const { data: totalXp } = await supabase.rpc("total_xp");
  if (Number(totalXp ?? 0) < stake) {
    return { ok: false, error: "Not enough XP to cover that stake." };
  }

  const { error: wagerError } = await supabase.from("xp_wagers").insert({
    owner_id: user.id,
    week_start: weekStart,
    stake,
  });
  if (wagerError) {
    return { ok: false, error: "You already have a wager on this week." };
  }

  // Escrow the stake. If this insert fails the wager row exists without a
  // deduction, so roll the wager back rather than leave a free bet.
  const { error: escrowError } = await supabase.from("xp_events").insert({
    owner_id: user.id,
    amount: -stake,
    reason: "wager_stake",
    dedupe_key: `wager_stake:${weekStart}`,
  });
  if (escrowError) {
    await supabase
      .from("xp_wagers")
      .delete()
      .eq("owner_id", user.id)
      .eq("week_start", weekStart);
    return { ok: false, error: "Could not place the wager. Try again." };
  }

  return { ok: true, newTotalXp: Number(totalXp) - stake };
}

export type WagerResolution = {
  weekStart: string;
  stake: number;
  outcome: "won" | "lost";
  /** XP credited on a win (stake + profit); 0 on a loss. */
  payout: number;
};

export type ResolveWagersResult = {
  resolutions: WagerResolution[];
  totalXp: number;
};

/**
 * Settle any active wagers that history can already judge. Called lazily on
 * dashboard mount (like achievement sync); safe to re-run — wins are
 * idempotent via the ledger dedupe key and status only moves off 'active'.
 */
export async function resolveWagers(): Promise<ResolveWagersResult> {
  const empty: ResolveWagersResult = { resolutions: [], totalXp: 0 };
  const user = await getUser();
  if (!user) return empty;

  const supabase = await createClient();
  const todayIso = await todayIsoLocal();

  const [{ data: wagers }, { data: logs }] = await Promise.all([
    supabase
      .from("xp_wagers")
      .select("id, week_start, stake")
      .eq("owner_id", user.id)
      .eq("status", "active"),
    supabase.from("daily_logs").select("log_date").eq("owner_id", user.id),
  ]);

  const loggedDates = (logs ?? []).map((l) => l.log_date);
  const resolutions: WagerResolution[] = [];

  for (const wager of wagers ?? []) {
    const outcome = wagerOutcome(loggedDates, wager.week_start, todayIso);
    if (outcome === "pending") continue;

    if (outcome === "won") {
      const { error } = await supabase.from("xp_events").insert({
        owner_id: user.id,
        amount: wagerPayout(wager.stake),
        reason: "wager_win",
        dedupe_key: `wager_win:${wager.week_start}`,
      });
      // A dedupe conflict means a concurrent resolve already paid out —
      // still fine to mark won; any other failure leaves it active to retry.
      if (error && error.code !== "23505") continue;
    }

    await supabase
      .from("xp_wagers")
      .update({ status: outcome, resolved_at: new Date().toISOString() })
      .eq("id", wager.id)
      .eq("status", "active");

    resolutions.push({
      weekStart: wager.week_start,
      stake: wager.stake,
      outcome,
      payout: outcome === "won" ? wagerPayout(wager.stake) : 0,
    });
  }

  const { data: totalXp } = await supabase.rpc("total_xp");
  return { resolutions, totalXp: Number(totalXp ?? 0) };
}
