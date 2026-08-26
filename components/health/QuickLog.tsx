"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Dumbbell,
  Droplet,
  Plus,
  Scale,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { displayToKg, kgToDisplay } from "@/lib/health/units";
import {
  loadQuickLogState,
  type QuickLogState,
} from "@/app/(app)/health/actions";
import { saveBodyMetrics } from "@/app/(app)/health/body/actions";
import { WaterCard } from "./WaterCard";

type Tab = "water" | "weight" | "food" | "train";

/**
 * The log-anything button, present on every page.
 *
 * Water and weight save without leaving whatever page you were on, because
 * both are a single number and navigating away to record one is exactly the
 * friction that stops people bothering. Food and training need real screens,
 * so those tabs hand over rather than reimplement.
 */
export function QuickLog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("water");
  const [state, setState] = useState<QuickLogState | null>(null);
  const [loading, startLoading] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const openSheet = () => {
    setOpen(true);
    setError(null);
    startLoading(async () => {
      const result = await loadQuickLogState();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setState(result.data);
    });
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={openSheet}
          aria-label="Quick log"
          title="Quick log"
          className="fixed bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {open && (
        <>
          <button
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setOpen(false)}
            aria-label="Close quick log"
          />
          <div
            role="dialog"
            aria-label="Quick log"
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl border border-border bg-card p-4 shadow-2xl sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-96 sm:rounded-2xl"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-foreground">
                Quick log
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 flex items-center gap-1 rounded-lg border border-border bg-background p-1">
              {(
                [
                  { id: "water", label: "Water", icon: Droplet },
                  { id: "weight", label: "Weight", icon: Scale },
                  { id: "food", label: "Food", icon: UtensilsCrossed },
                  { id: "train", label: "Train", icon: Dumbbell },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-1 rounded-md px-2 py-2 text-[11px] font-medium transition-colors",
                    tab === t.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <t.icon className="h-4 w-4" />
                  {t.label}
                </button>
              ))}
            </div>

            <div className="mt-3">
              {error && (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              {!error && (loading || !state) && (
                <div className="h-32 animate-pulse rounded-xl border border-border bg-muted/40" />
              )}

              {state && !loading && (
                <>
                  {tab === "water" && (
                    <WaterCard
                      compact
                      logDate={state.logDate}
                      entries={state.waterEntries}
                      goalMl={state.waterGoalMl}
                      volumeUnit={state.volumeUnit}
                    />
                  )}

                  {tab === "weight" && (
                    <QuickWeight
                      logDate={state.logDate}
                      weightKg={state.weightKg}
                      weightUnit={state.weightUnit}
                      onSaved={() => router.refresh()}
                    />
                  )}

                  {tab === "food" && (
                    <Handoff
                      href="/health/eat"
                      onNavigate={() => setOpen(false)}
                      title="Log a meal"
                      body="Type what you ate and the estimate comes back editable — or re-log something in one tap."
                    />
                  )}

                  {tab === "train" && (
                    <Handoff
                      href="/health/train"
                      onNavigate={() => setOpen(false)}
                      title={
                        state.hasWorkoutToday
                          ? "Back to today's session"
                          : "Start a workout"
                      }
                      body={
                        state.hasWorkoutToday
                          ? "You have a session going today."
                          : "Repeat your last workout in one tap, or start from scratch."
                      }
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function QuickWeight({
  logDate,
  weightKg,
  weightUnit,
  onSaved,
}: {
  logDate: string;
  weightKg: number | null;
  weightUnit: "kg" | "lb";
  onSaved: () => void;
}) {
  const [value, setValue] = useState(
    weightKg === null ? "" : kgToDisplay(weightKg, weightUnit).toFixed(1)
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [xpGained, setXpGained] = useState(0);

  const save = () => {
    const n = Number(value.trim());
    if (!Number.isFinite(n) || n <= 0) {
      setError("Enter a weight.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await saveBodyMetrics({
        measuredOn: logDate,
        weightKg: displayToKg(n, weightUnit),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      setXpGained("xp" in result && result.xp ? result.xp : 0);
      onSaved();
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <label htmlFor="quick_weight" className="mb-2 block text-sm font-medium text-foreground">
        Weight today ({weightUnit})
      </label>
      <div className="flex items-center gap-2">
        <input
          id="quick_weight"
          type="number"
          inputMode="decimal"
          step="0.1"
          autoFocus
          value={value}
          disabled={pending}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
          placeholder="—"
          className="h-11 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
        />
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="h-11 shrink-0 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="mt-2 flex min-h-[18px] items-center gap-2 text-xs">
        {error && <span className="text-destructive">{error}</span>}
        {!error && saved && xpGained > 0 && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
            +{xpGained} XP
          </span>
        )}
        {!error && saved && xpGained === 0 && (
          <span className="text-muted-foreground">Saved.</span>
        )}
        {!error && !saved && weightKg !== null && (
          <span className="text-muted-foreground">
            Already logged today — saving replaces it.
          </span>
        )}
      </div>
    </div>
  );
}

function Handoff({
  href,
  title,
  body,
  onNavigate,
}: {
  href: string;
  title: string;
  body: string;
  onNavigate: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{body}</p>
      <Link
        href={href}
        onClick={onNavigate}
        className="mt-3 block rounded-md bg-primary px-4 py-2.5 text-center text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        {title}
      </Link>
    </div>
  );
}
