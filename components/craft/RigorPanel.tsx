"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CHECKLIST,
  CHECKLIST_TOTAL,
  isComplete,
  tickedCount,
  type Ticks,
} from "@/lib/craft/checklist";
import { completeRigor, detachRigor, setTick } from "@/app/(app)/todo/rigor";

export function RigorPanel({
  taskId,
  ticks,
  onTicks,
  onCompleted,
  onDetached,
}: {
  taskId: string;
  ticks: Ticks;
  /** Lift ticks so the row chip and this panel never disagree. */
  onTicks: (next: Ticks) => void;
  onCompleted: () => void;
  onDetached: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, startTransition] = useTransition();

  const done = tickedCount(ticks);
  const ready = isComplete(ticks);
  const left = CHECKLIST_TOTAL - done;

  const toggle = (itemId: string, value: boolean) => {
    setError(null);
    const optimistic = { ...ticks, [itemId]: value };
    if (!value) delete optimistic[itemId];
    onTicks(optimistic);

    startTransition(async () => {
      const result = await setTick({ taskId, itemId, value });
      if (!result.ok) {
        setError(result.error);
        onTicks(ticks);
        return;
      }
      onTicks(result.data.ticks);
    });
  };

  const complete = () => {
    setError(null);
    startTransition(async () => {
      const result = await completeRigor({ taskId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onCompleted();
    });
  };

  const remove = () => {
    if (!confirmRemove) {
      setConfirmRemove(true);
      window.setTimeout(() => setConfirmRemove(false), 3000);
      return;
    }
    startTransition(async () => {
      const result = await detachRigor({ taskId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onDetached();
    });
  };

  return (
    <div className="mx-2 mb-2 rounded-lg border border-border bg-card/60 px-3 py-3 sm:px-4">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Rigor
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {done} of {CHECKLIST_TOTAL}
        </span>
      </div>

      <div
        className="mb-3 h-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={CHECKLIST_TOTAL}
        aria-label="Checklist progress"
      >
        <div
          className="h-full bg-primary transition-[width] duration-200 motion-reduce:transition-none"
          style={{ width: `${(done / CHECKLIST_TOTAL) * 100}%` }}
        />
      </div>

      <div className="space-y-3">
        {CHECKLIST.map((stage) => (
          <section key={stage.id}>
            <h3 className="mb-1 flex items-baseline gap-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {stage.title}
              <span className="font-normal normal-case tracking-normal text-muted-foreground/70">
                {stage.when.toLowerCase()}
              </span>
            </h3>
            <ul className="space-y-0.5">
              {stage.items.map((item) => {
                const on = Boolean(ticks[item.id]);
                return (
                  <li key={item.id}>
                    <label className="flex cursor-pointer items-start gap-2.5 rounded p-1 hover:bg-accent/50">
                      <span
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                          on
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/50"
                        )}
                      >
                        {on && <Check className="h-2.5 w-2.5" />}
                      </span>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={on}
                        onChange={(e) => toggle(item.id, e.target.checked)}
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block text-sm leading-snug",
                            on ? "text-muted-foreground" : "text-foreground"
                          )}
                        >
                          {item.text}
                        </span>
                        {item.hint && !on && (
                          <span className="mt-0.5 block text-xs leading-snug text-muted-foreground/80">
                            {item.hint}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-3 border-t border-border pt-3">
        {error && (
          <p className="mb-2 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={complete}
            disabled={!ready || pending}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
              ready
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "cursor-not-allowed bg-muted text-muted-foreground"
            )}
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            {ready ? "Done" : `${left} left`}
          </button>

          <button
            onClick={remove}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-xs transition-colors",
              confirmRemove
                ? "bg-destructive/10 text-destructive"
                : "text-muted-foreground hover:text-destructive"
            )}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {confirmRemove ? "Remove checklist?" : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}
