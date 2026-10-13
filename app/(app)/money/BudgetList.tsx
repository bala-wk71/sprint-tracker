"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney, TOTAL_BUDGET, type CategoryLine } from "@/lib/money/summary";
import { useAppTheme } from "@/lib/hooks/useAppTheme";
import { setBudget } from "./actions";

export function BudgetList({
  lines,
  currency,
  totalLimit,
}: {
  lines: CategoryLine[];
  currency: string;
  totalLimit: number | null;
}) {
  const { theme } = useAppTheme();
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const open = (category: string, current: number | null) => {
    setEditing(category);
    setValue(current ? String(current) : "");
    setError(null);
  };

  const save = () => {
    if (!editing) return;
    const limit = value.trim() === "" ? 0 : Number(value);
    if (!Number.isFinite(limit) || limit < 0) {
      setError("Enter an amount, or leave it empty to remove the budget.");
      return;
    }
    startTransition(async () => {
      const result = await setBudget({ category: editing, limit });
      if (!result.ok) setError(result.error);
      else setEditing(null);
    });
  };

  const editor = (
    <form
      className="mt-2 flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <input
        autoFocus
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Monthly limit"
        aria-label="Monthly limit"
        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => setEditing(null)}
        className="rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        Cancel
      </button>
    </form>
  );

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="font-medium text-foreground">Whole month</span>
          <button
            type="button"
            onClick={() => open(TOTAL_BUDGET, totalLimit)}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            {totalLimit ? formatMoney(totalLimit, currency) : "Set a limit"}
            <Pencil className="h-3 w-3" />
          </button>
        </div>
        {editing === TOTAL_BUDGET && editor}
      </div>

      {lines.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Categories appear here once there is spending. Sync from Cashew or
          add a transaction to start.
        </p>
      )}

      {lines.map((line) => (
        <div key={line.category}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate font-medium text-foreground">
              {line.category}
            </span>
            <button
              type="button"
              onClick={() => open(line.category, line.limit)}
              className="flex shrink-0 items-center gap-1 tabular-nums text-muted-foreground hover:text-foreground"
            >
              <span className={cn(line.over && "font-semibold text-progress-danger")}>
                {formatMoney(line.spent, currency)}
              </span>
              {line.limit !== null ? (
                <span>/ {formatMoney(line.limit, currency)}</span>
              ) : (
                <span className="text-xs">· set budget</span>
              )}
              <Pencil className="h-3 w-3" />
            </button>
          </div>
          {line.limit !== null && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    line.over
                      ? "bg-progress-danger"
                      : (line.pct ?? 0) > 80
                        ? "bg-progress-warning"
                        : "bg-progress-good"
                  )}
                  style={{ width: `${line.pct ?? 0}%` }}
                />
              </div>
              {line.over && (
                <span className="shrink-0 text-xs font-semibold text-progress-danger">
                  {theme === "retro"
                    ? "KO"
                    : `Over by ${formatMoney(line.spent - line.limit, currency)}`}
                </span>
              )}
            </div>
          )}
          {editing === line.category && editor}
        </div>
      ))}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
