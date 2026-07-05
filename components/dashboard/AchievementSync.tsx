"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PartyPopper, X } from "lucide-react";
import { ACHIEVEMENTS } from "@/lib/gamification";
import { syncAchievements } from "@/app/(app)/dashboard/gamification-actions";

/**
 * On dashboard mount, recheck achievements against history and celebrate
 * anything newly unlocked. Runs once per mount; cheap no-op when nothing new.
 */
export function AchievementSync() {
  const router = useRouter();
  const ran = useRef(false);
  const [unlocked, setUnlocked] = useState<string[]>([]);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    syncAchievements()
      .then(({ newlyUnlocked }) => {
        if (newlyUnlocked.length > 0) {
          setUnlocked(newlyUnlocked);
          router.refresh();
        }
      })
      .catch(() => {
        // Non-critical: never let gamification break the dashboard.
      });
  }, [router]);

  if (unlocked.length === 0) return null;

  const defs = ACHIEVEMENTS.filter((a) => unlocked.includes(a.id));

  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-primary/40 bg-card p-4 shadow-xl"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <PartyPopper className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            Achievement{defs.length > 1 ? "s" : ""} unlocked!
          </p>
          <ul className="mt-1 space-y-0.5">
            {defs.map((a) => (
              <li key={a.id} className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{a.title}</span>
                {" — "}
                {a.description}
              </li>
            ))}
          </ul>
        </div>
        <button
          onClick={() => setUnlocked([])}
          aria-label="Dismiss"
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
