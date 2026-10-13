"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { addTransaction } from "./actions";

export function AddTxnForm({
  defaultDate,
  currency,
  categories,
}: {
  defaultDate: string;
  currency: string;
  categories: string[];
}) {
  const [amount, setAmount] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [isIncome, setIsIncome] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await addTransaction({
        date,
        amount: Number(amount),
        isIncome,
        category: category.trim() || (isIncome ? "Income" : "Uncategorised"),
        title,
        currency,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAmount("");
      setTitle("");
      setSaved(true);
    });
  };

  const field =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm font-medium">
        {[
          { v: false, label: "Spent" },
          { v: true, label: "Received" },
        ].map((o) => (
          <button
            key={o.label}
            type="button"
            aria-pressed={isIncome === o.v}
            onClick={() => setIsIncome(o.v)}
            className={cn(
              "rounded-md py-1.5",
              isIncome === o.v
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs text-muted-foreground">
          Amount ({currency})
          <input
            required
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={cn(field, "mt-1")}
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          Date
          <input
            required
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={cn(field, "mt-1")}
          />
        </label>
      </div>
      <label className="block text-xs text-muted-foreground">
        What was it?
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          className={cn(field, "mt-1")}
        />
      </label>
      <label className="block text-xs text-muted-foreground">
        Category
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          list="money-categories"
          maxLength={80}
          className={cn(field, "mt-1")}
        />
        <datalist id="money-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Add"}
        </button>
        {saved && <span className="text-xs text-muted-foreground">Added.</span>}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </form>
  );
}
