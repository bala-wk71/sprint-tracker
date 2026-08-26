"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Droplet, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { WATER_PRESETS } from "@/lib/health/constants";
import { formatVolume, type VolumeUnit } from "@/lib/health/units";
import { deleteWaterLog, logWater } from "@/app/(app)/health/actions";

export type WaterEntry = { id: string; amount_ml: number };

type Props = {
  logDate: string;
  entries: WaterEntry[];
  goalMl: number;
  volumeUnit: VolumeUnit;
  /** Compact layout for the quick-log sheet. */
  compact?: boolean;
};

export function WaterCard({
  logDate,
  entries: initialEntries,
  goalMl,
  volumeUnit,
  compact = false,
}: Props) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [pending, startTransition] = useTransition();
  const [xpGained, setXpGained] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Resync when the server sends a new list (navigation or refresh) without
  // getting in the way of the taps in between.
  const [lastServer, setLastServer] = useState(initialEntries);
  if (initialEntries !== lastServer) {
    setLastServer(initialEntries);
    setEntries(initialEntries);
  }

  const total = entries.reduce((s, e) => s + e.amount_ml, 0);
  const pct = goalMl > 0 ? Math.min(100, Math.round((total / goalMl) * 100)) : 0;
  const met = total >= goalMl;

  const add = (amountMl: number) => {
    setError(null);
    const tempId = crypto.randomUUID();
    setEntries((list) => [...list, { id: tempId, amount_ml: amountMl }]);

    startTransition(async () => {
      const result = await logWater({ logDate, amountMl });
      if (!result.ok) {
        setError(result.error);
        setEntries((list) => list.filter((e) => e.id !== tempId));
        return;
      }
      setEntries((list) =>
        list.map((e) => (e.id === tempId ? { ...e, id: result.data.id } : e))
      );
      if ("xp" in result && result.xp) setXpGained(result.xp);
      router.refresh();
    });
  };

  const undo = () => {
    const last = entries[entries.length - 1];
    if (!last) return;
    setEntries((list) => list.slice(0, -1));
    startTransition(async () => {
      const result = await deleteWaterLog(last.id);
      if (!result.ok) {
        setError(result.error);
        setEntries((list) => [...list, last]);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card",
        compact ? "p-4" : "p-4 sm:p-6"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Droplet
            className={cn(
              "h-4 w-4",
              met ? "text-[hsl(var(--progress-good))]" : "text-muted-foreground"
            )}
          />
          Water
        </h2>
        <span className="text-xs text-muted-foreground">
          {formatVolume(total, volumeUnit)} / {formatVolume(goalMl, volumeUnit)}
        </span>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            met ? "bg-[hsl(var(--progress-good))]" : "bg-primary"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {WATER_PRESETS.map((amount) => (
          <button
            key={amount}
            type="button"
            disabled={pending}
            onClick={() => add(amount)}
            className="h-11 flex-1 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground hover:border-primary/50 hover:bg-accent disabled:opacity-50"
          >
            +{formatVolume(amount, volumeUnit)}
          </button>
        ))}
        <button
          type="button"
          disabled={pending || entries.length === 0}
          onClick={undo}
          aria-label="Undo last drink"
          title="Undo last drink"
          className="h-11 shrink-0 rounded-md px-3 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
        >
          <Undo2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 flex min-h-[18px] items-center gap-2 text-xs">
        {error && <span className="text-destructive">{error}</span>}
        {!error && xpGained > 0 && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
            +{xpGained} XP · goal hit
          </span>
        )}
        {!error && xpGained === 0 && entries.length > 0 && (
          <span className="text-muted-foreground">
            {entries.length} drink{entries.length === 1 ? "" : "s"} today
          </span>
        )}
      </div>
    </div>
  );
}
