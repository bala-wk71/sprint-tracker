"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { cn } from "@/lib/utils";

const TARGETS = [60, 90, 120, 180] as const;

/**
 * Time since the last set was logged.
 *
 * Counts up rather than down, and has no alarm: a countdown that finishes
 * while the phone is in a pocket is just a notification to dismiss, whereas
 * "3:10 since your last set" answers the only question being asked. Purely
 * client-side — nothing about a rest is worth storing.
 */
export function RestTimer({ startedAt }: { startedAt: number | null }) {
  const [target, setTarget] = useState<number>(120);
  const [now, setNow] = useState(startedAt ?? 0);

  // Rewind during render rather than from an effect, so logging a set shows
  // 0:00 straight away instead of the previous rest until the next tick.
  const [lastStart, setLastStart] = useState(startedAt);
  if (startedAt !== lastStart) {
    setLastStart(startedAt);
    setNow(startedAt ?? 0);
  }

  useEffect(() => {
    if (startedAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  if (startedAt === null) return null;

  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  const done = elapsed >= target;
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
      <Timer
        className={cn(
          "h-4 w-4 shrink-0",
          done ? "text-[hsl(var(--progress-good))]" : "text-muted-foreground"
        )}
      />
      <span
        className={cn(
          "font-mono text-sm font-semibold tabular-nums",
          done ? "text-[hsl(var(--progress-good))]" : "text-foreground"
        )}
      >
        {mins}:{String(secs).padStart(2, "0")}
      </span>
      <span className="text-xs text-muted-foreground">rest</span>

      <div className="ml-auto flex items-center gap-1">
        {TARGETS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTarget(t)}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium transition-colors",
              target === t
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {t < 60 ? `${t}s` : `${t / 60}m`}
          </button>
        ))}
      </div>
    </div>
  );
}
