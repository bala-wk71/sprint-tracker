"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney, type MoneyTxn } from "@/lib/money/summary";
import { deleteTransaction } from "./actions";

const PAGE = 30;

function dayLabel(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function TxnList({ txns }: { txns: MoneyTxn[] }) {
  const [shown, setShown] = useState(PAGE);
  const [pending, startTransition] = useTransition();

  if (txns.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No transactions in this month.
      </p>
    );
  }

  const visible = txns.slice(0, shown);
  const days = [...new Set(visible.map((t) => t.txn_date))];

  return (
    <div className="space-y-4">
      {days.map((day) => (
        <div key={day}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {dayLabel(day)}
          </p>
          <ul className="divide-y divide-border">
            {visible
              .filter((t) => t.txn_date === day)
              .map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {t.title || t.category}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.category}
                      {t.account ? ` · ${t.account}` : ""}
                      {t.source === "cashew" ? " · Cashew" : ""}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-sm font-semibold tabular-nums",
                      t.is_income ? "text-progress-good" : "text-foreground"
                    )}
                  >
                    {t.is_income ? "+" : "-"}
                    {formatMoney(Number(t.amount), t.currency)}
                  </span>
                  {/* Synced rows are owned by Cashew: delete them there and
                      the next sync removes them here. */}
                  {t.source === "manual" ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          await deleteTransaction(t.id);
                        })
                      }
                      aria-label={`Delete ${t.title || t.category}`}
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : (
                    <span className="w-7 shrink-0" />
                  )}
                </li>
              ))}
          </ul>
        </div>
      ))}
      {txns.length > shown && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          className="w-full rounded-md border border-border py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Show more ({txns.length - shown} left)
        </button>
      )}
    </div>
  );
}
