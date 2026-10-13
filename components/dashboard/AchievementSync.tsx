"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ACHIEVEMENTS } from "@/lib/gamification";
import { syncAchievements } from "@/app/(app)/dashboard/gamification-actions";
import { xpToast } from "@/lib/xpToast";

/**
 * When the app opens, recheck achievements against history and celebrate
 * anything newly unlocked. Runs once per mount; cheap no-op when nothing new.
 */
export function AchievementSync() {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    syncAchievements()
      .then(({ newlyUnlocked }) => {
        if (newlyUnlocked.length === 0) return;
        for (const a of ACHIEVEMENTS.filter((d) =>
          newlyUnlocked.includes(d.id)
        ).slice(0, 3)) {
          xpToast({ kind: "badge", detail: `${a.title} — ${a.description}` });
        }
        router.refresh();
      })
      .catch(() => {
        // Non-critical: never let gamification break the app.
      });
  }, [router]);

  return null;
}
