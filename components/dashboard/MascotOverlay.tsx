"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { resolveWagers } from "@/app/(app)/dashboard/wager-actions";
import { applyXpDecay } from "@/app/(app)/dashboard/gamification-actions";
import {
  getLastSeenXp,
  getSeenReset,
  setLastSeenXp,
  setSeenReset,
} from "@/lib/xpVisit";
import { pickMascotArt, type MascotMood as Mood } from "@/lib/mascotArt";
import { xpToast, type XpToastKind } from "@/lib/xpToast";

/**
 * Visit greeter: when the app opens it settles any decidable wagers, then
 * reports the verdict — or, with no wager news, the XP gained or lost since
 * the last visit — as an XP popup. Character art rotates randomly from the
 * pools in lib/mascotArt.ts (files live in public/mascot/) and rides along in
 * the popup; a plain icon shows when a pool is empty or a file fails to load.
 */
export function MascotOverlay() {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const show = (
      mood: Mood,
      headline: string,
      detail: string,
      kind: XpToastKind = mood === "happy" ? "gain" : "loss"
    ) =>
      xpToast({ kind, title: headline, detail, art: pickMascotArt(mood) });

    // Decay settles first so the wager reads a post-bleed balance and the
    // mascot never reports an XP total the page is about to contradict.
    applyXpDecay()
      .then((decay) => resolveWagers().then((wagers) => ({ decay, wagers })))
      .then(({ decay, wagers: { resolutions, totalXp } }) => {
        const lastSeen = getLastSeenXp();
        setLastSeenXp(totalXp);
        if (resolutions.length > 0 || decay.applied > 0) {
          router.refresh();
        }

        // A zeroed balance is a reset, not a loss. Without this the mascot
        // greets everyone with "-243 XP since your last visit", which reads
        // as a bug or a punishment rather than the announced fresh start.
        if (decay.resetOn && getSeenReset() !== decay.resetOn) {
          setSeenReset(decay.resetOn);
          show(
            "happy",
            "Everyone's XP is back to zero",
            "Fresh start: XP now comes from tracking your days, and todos only count on a day you logged. Your badges and history are untouched.",
            "info"
          );
          return;
        }

        const lost = resolutions.find((r) => r.outcome === "lost");
        const won = resolutions.find((r) => r.outcome === "won");
        if (lost) {
          show(
            "sad",
            "Wager lost…",
            `Your ${lost.stake} XP stake is gone — the week had a missed day. Win it back next time.`
          );
        } else if (won) {
          show(
            "happy",
            "Wager won!",
            `All 7 days logged — +${won.payout} XP paid out. That's how it's done!`
          );
        } else if (decay.applied > 0) {
          show(
            "sad",
            `-${decay.applied} XP while you were away`,
            `${decay.days} ${decay.days === 1 ? "day" : "days"} went untracked. Log today and it stops.`
          );
        } else if (lastSeen !== null && totalXp > lastSeen) {
          show(
            "happy",
            `+${totalXp - lastSeen} XP since your last visit`,
            "Keep stacking. The streak feeds the level."
          );
        } else if (lastSeen !== null && totalXp < lastSeen) {
          show(
            "sad",
            `${totalXp - lastSeen} XP since your last visit`,
            "Down, not out — log today and climb back."
          );
        }
      })
      .catch(() => {
        // Non-critical: never let the mascot break the dashboard.
      });
  }, [router]);

  return null;
}
