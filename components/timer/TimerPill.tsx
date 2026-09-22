"use client";

import Link from "next/link";
import { BellOff, Coffee, Pause, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { PHASE_LABEL, formatClock, runLabel } from "@/lib/timer/engine";
import { useFocusTimer } from "./FocusTimerProvider";

/** Header indicator so a running timer is visible from every page. */
export function TimerPill() {
  const { state, remaining, hydrated, ringing, stopAlarm } = useFocusTimer();
  const run = state.run;
  if (!hydrated) return null;

  // Wherever you are when time's up, the off switch is one tap away.
  if (ringing) {
    return (
      <button
        type="button"
        onClick={stopAlarm}
        className="flex animate-pulse items-center gap-1.5 rounded-full bg-destructive px-3 py-1 text-xs font-semibold text-destructive-foreground"
      >
        <BellOff className="h-3.5 w-3.5" /> Stop alarm
      </button>
    );
  }
  if (!run) return null;

  const isBreak = run.phase !== "focus";
  const Icon = run.status === "paused" ? Pause : isBreak ? Coffee : Timer;
  const label =
    run.status === "ready" ? `${PHASE_LABEL[run.phase]} next` : formatClock(remaining);

  return (
    <Link
      href="/daily#time"
      title={`${runLabel(run)}${run.taskName ? ` · ${run.taskName}` : ""}`}
      aria-label={`Focus timer: ${runLabel(run)}, ${label}`}
      data-testid="timer-pill"
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums transition-colors",
        isBreak
          ? "border-[hsl(var(--strong-signal))]/40 bg-[hsl(var(--strong-signal))]/10 text-[hsl(var(--strong-signal))]"
          : "border-primary/40 bg-primary/10 text-primary",
        run.status !== "running" && "opacity-75"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}
