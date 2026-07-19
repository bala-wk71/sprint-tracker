"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { resolveWagers } from "@/app/(app)/dashboard/wager-actions";
import { getLastSeenXp, setLastSeenXp } from "@/lib/xpVisit";
import { pickMascotArt, type MascotMood as Mood } from "@/lib/mascotArt";

type Scene = {
  mood: Mood;
  headline: string;
  detail: string;
  /** Chosen art for this appearance; null renders the built-in SVG mascot. */
  art: string | null;
};

const CONFETTI_COLORS = [
  "hsl(var(--strong-signal))",
  "hsl(var(--weak-signal))",
  "hsl(var(--personal))",
  "hsl(var(--weak-noise))",
];

/**
 * Visit greeter: on dashboard mount it settles any decidable wagers, then has
 * the mascot report the verdict — or, with no wager news, the XP gained or
 * lost since the last visit. Character art rotates randomly from the pools
 * in lib/mascotArt.ts (files live in public/mascot/); a built-in SVG mascot
 * renders when a pool is empty or a file fails to load.
 */
export function MascotOverlay() {
  const router = useRouter();
  const ran = useRef(false);
  const [scene, setScene] = useState<Scene | null>(null);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const show = (mood: Mood, headline: string, detail: string) =>
      setScene({ mood, headline, detail, art: pickMascotArt(mood) });

    resolveWagers()
      .then(({ resolutions, totalXp }) => {
        const lastSeen = getLastSeenXp();
        setLastSeenXp(totalXp);
        if (resolutions.length > 0) {
          router.refresh();
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

  useEffect(() => {
    if (!scene) return;
    const t = setTimeout(() => setScene(null), 9000);
    return () => clearTimeout(t);
  }, [scene]);

  if (!scene) return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col items-end"
    >
      {scene.mood === "happy" && (
        <div aria-hidden className="relative h-0 w-56 self-center">
          {Array.from({ length: 14 }).map((_, i) => (
            <span
              key={i}
              className="mascot-confetti-piece absolute top-0 block h-2 w-1.5 rounded-[1px]"
              style={{
                left: `${(i * 89) % 100}%`,
                background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                animationDelay: `${0.5 + ((i * 53) % 40) / 100}s`,
              }}
            />
          ))}
        </div>
      )}
      <div className="mascot-bubble pointer-events-auto relative mb-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-3 shadow-xl">
        <p className="pr-6 text-sm font-semibold text-foreground">
          {scene.headline}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{scene.detail}</p>
        <button
          onClick={() => setScene(null)}
          aria-label="Dismiss"
          className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
        <span className="absolute -bottom-1.5 right-10 h-3 w-3 rotate-45 border-b border-r border-border bg-card" />
      </div>
      <div className={`mascot-enter mr-6 ${scene.mood === "happy" ? "mascot-happy" : "mascot-sad"}`}>
        {scene.art ? (
          // user-supplied local file that may not exist; next/image would
          // log 404 errors instead of falling back cleanly
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={scene.art}
            alt=""
            aria-hidden
            className="h-24 w-24 rounded-lg object-contain drop-shadow-lg"
            onError={() => setScene({ ...scene, art: null })}
          />
        ) : (
          <FallbackMascot mood={scene.mood} />
        )}
      </div>
    </div>
  );
}

/** Original stand-in character shown until custom art exists in public/mascot/. */
function FallbackMascot({ mood }: { mood: Mood }) {
  const body =
    mood === "happy" ? "hsl(var(--strong-signal))" : "hsl(var(--weak-noise))";
  return (
    <svg
      viewBox="0 0 96 96"
      aria-hidden
      className="h-24 w-24 drop-shadow-lg"
    >
      <ellipse cx="48" cy="90" rx="22" ry="4" className="fill-foreground/10" />
      <path
        d="M48 12c19 0 30 13 30 30 0 20-13 34-30 34S18 62 18 42c0-17 11-30 30-30z"
        fill={body}
      />
      {/* antenna — it's a signal tracker, after all */}
      <line x1="48" y1="12" x2="48" y2="4" stroke={body} strokeWidth="3" strokeLinecap="round" />
      <circle cx="48" cy="3" r="3" fill={body} />
      {mood === "happy" ? (
        <>
          <path d="M34 40q4 -6 8 0" stroke="#0D1117" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M54 40q4 -6 8 0" stroke="#0D1117" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M36 54q12 12 24 0" stroke="#0D1117" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M34 40q4 3 8 1" stroke="#0D1117" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M54 41q4 2 8 -1" stroke="#0D1117" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M38 60q10 -8 20 0" stroke="#0D1117" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          <path d="M63 48q5 7 0 9t-5 -4z" fill="hsl(var(--personal))" />
        </>
      )}
    </svg>
  );
}
