"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dices, TrendingUp, TrendingDown } from "lucide-react";
import { WAGER_PRESETS, wagerProfit, wagerPayout } from "@/lib/gamification";
import { placeWager } from "@/app/(app)/dashboard/wager-actions";
import { setLastSeenXp } from "@/lib/xpVisit";
import {
  DEFAULT_WEEK_START_DAY,
  addDaysIso,
  weekStartDayName,
  type WeekStartDay,
} from "@/lib/week";

export type WagerSummary = {
  stake: number;
  status: "active" | "won" | "lost";
};

type Props = {
  weekStart: string;
  todayIso: string;
  /** This week's wager, if one was placed. */
  wager: WagerSummary | null;
  totalXp: number;
  /** Whether today is still inside the two-day placement window. */
  placementOpen: boolean;
  /** Dates logged within this week. */
  weekLoggedDates: string[];
  /** The user's first day of the week — the day labels and the copy follow it. */
  weekStartDay?: WeekStartDay;
};

const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

/** Seven single-letter labels starting from the user's first day. */
function dayInitialsFrom(weekStartDay: WeekStartDay): string[] {
  return Array.from(
    { length: 7 },
    (_, i) => DAY_INITIALS[(weekStartDay + i) % 7]
  );
}

export function WagerCard({
  weekStart,
  todayIso,
  wager,
  totalXp,
  placementOpen,
  weekLoggedDates,
  weekStartDay = DEFAULT_WEEK_START_DAY,
}: Props) {
  const firstDay = weekStartDayName(weekStartDay);
  const secondDay = weekStartDayName(((weekStartDay + 1) % 7) as WeekStartDay);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <Dices className="h-4 w-4 text-[hsl(var(--weak-noise))]" />
        <span className="text-sm font-medium text-muted-foreground">
          Weekly wager
        </span>
      </div>
      {wager ? (
        <ActiveOrSettled
          wager={wager}
          weekStart={weekStart}
          todayIso={todayIso}
          weekLoggedDates={weekLoggedDates}
          weekStartDay={weekStartDay}
          firstDay={firstDay}
        />
      ) : placementOpen ? (
        <PlaceForm totalXp={totalXp} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Wagers open {firstDay} and {secondDay}: stake XP that you&apos;ll log
          all 7 days of the week. Win it back with +50% profit — or lose the
          stake.
        </p>
      )}
    </div>
  );
}

function PlaceForm({ totalXp }: { totalXp: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const place = (stake: number) => {
    setError(null);
    startTransition(async () => {
      const result = await placeWager(stake);
      if (result.ok) {
        // Baseline last-seen XP past the escrow so the mascot doesn't read
        // the deliberate stake as a loss on the next visit.
        setLastSeenXp(result.newTotalXp);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <div>
      <p className="text-sm text-muted-foreground">
        Stake XP that you&apos;ll log all 7 days this week. Win: stake back
        +50%. Miss a day: it&apos;s gone.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {WAGER_PRESETS.map((stake) => (
          <button
            key={stake}
            onClick={() => place(stake)}
            disabled={pending || totalXp < stake}
            title={
              totalXp < stake
                ? "Not enough XP to cover this stake"
                : `Win +${wagerProfit(stake)} XP profit`
            }
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {stake} XP
          </button>
        ))}
        {pending && (
          <span className="text-xs text-muted-foreground">Placing…</span>
        )}
      </div>
      {error && (
        <p className="mt-2 text-xs text-[hsl(var(--progress-danger))]">
          {error}
        </p>
      )}
    </div>
  );
}

function ActiveOrSettled({
  wager,
  weekStart,
  todayIso,
  weekLoggedDates,
  weekStartDay,
  firstDay,
}: {
  wager: WagerSummary;
  weekStart: string;
  todayIso: string;
  weekLoggedDates: string[];
  weekStartDay: WeekStartDay;
  firstDay: string;
}) {
  if (wager.status === "won") {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--strong-signal))]">
        <TrendingUp className="h-4 w-4 shrink-0" />
        Won this week — all 7 days logged, +{wagerPayout(wager.stake)} XP paid
        out.
      </p>
    );
  }
  if (wager.status === "lost") {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--progress-danger))]">
        <TrendingDown className="h-4 w-4 shrink-0" />
        Lost this week — the {wager.stake} XP stake is gone. Next week&apos;s
        table opens {firstDay}.
      </p>
    );
  }

  const logged = new Set(weekLoggedDates);
  return (
    <div>
      <div className="flex items-center gap-1.5">
        {dayInitialsFrom(weekStartDay).map((label, i) => {
          const day = addDaysIso(weekStart, i);
          const isLogged = logged.has(day);
          const missed = !isLogged && day < todayIso;
          return (
            <span
              key={day}
              title={day}
              className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold ${
                isLogged
                  ? "bg-[hsl(var(--strong-signal))]/15 text-[hsl(var(--strong-signal))]"
                  : missed
                    ? "bg-[hsl(var(--progress-danger))]/15 text-[hsl(var(--progress-danger))]"
                    : day === todayIso
                      ? "border border-primary text-primary"
                      : "bg-muted text-muted-foreground"
              }`}
            >
              {label}
            </span>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {wager.stake} XP riding on this week — log every day through Sunday to
        collect {wagerPayout(wager.stake)} XP (+{wagerProfit(wager.stake)}{" "}
        profit).
      </p>
    </div>
  );
}
