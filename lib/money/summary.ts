// Pure maths for the Money page and the Home money tile.

/** Budget category that caps the whole month rather than one category. */
export const TOTAL_BUDGET = "*";

export type MoneyTxn = {
  id: string;
  txn_date: string;
  amount: number;
  is_income: boolean;
  category: string;
  title: string;
  account: string;
  currency: string;
  source: string;
};

export type MoneyBudget = { category: string; monthly_limit: number };

export type CategoryLine = {
  category: string;
  spent: number;
  limit: number | null;
  /** 0–100, capped; null without a limit. */
  pct: number | null;
  over: boolean;
};

export type MonthSummary = {
  spent: number;
  income: number;
  /** The month's cap: the '*' budget, else the sum of category budgets. */
  limit: number | null;
  left: number | null;
  pct: number | null;
  categories: CategoryLine[];
  overCount: number;
};

/** "2026-10" → first and last day, both YYYY-MM-DD. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(last).padStart(2, "0")}`,
  };
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function isValidMonth(value: string | undefined): value is string {
  return !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function summariseMonth(
  txns: readonly Pick<MoneyTxn, "amount" | "is_income" | "category">[],
  budgets: readonly MoneyBudget[]
): MonthSummary {
  let spent = 0;
  let income = 0;
  const byCategory = new Map<string, number>();

  for (const t of txns) {
    const amount = Number(t.amount);
    if (t.is_income) {
      income += amount;
    } else {
      spent += amount;
      byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + amount);
    }
  }

  const limits = new Map(
    budgets
      .filter((b) => b.category !== TOTAL_BUDGET)
      .map((b) => [b.category, Number(b.monthly_limit)])
  );
  const names = new Set([...byCategory.keys(), ...limits.keys()]);

  const categories: CategoryLine[] = [...names].map((category) => {
    const s = byCategory.get(category) ?? 0;
    const limit = limits.get(category) ?? null;
    return {
      category,
      spent: s,
      limit,
      pct: limit ? Math.min(100, Math.round((s / limit) * 100)) : null,
      over: limit !== null && s > limit,
    };
  });
  // Budgeted categories first (closest to the limit on top), then the rest
  // by how much was spent.
  categories.sort((a, b) => {
    if ((a.limit === null) !== (b.limit === null)) return a.limit === null ? 1 : -1;
    if (a.limit !== null && b.limit !== null) {
      return b.spent / b.limit - a.spent / a.limit;
    }
    return b.spent - a.spent;
  });

  const total = budgets.find((b) => b.category === TOTAL_BUDGET);
  const summed = [...limits.values()].reduce((a, b) => a + b, 0);
  const limit = total ? Number(total.monthly_limit) : summed > 0 ? summed : null;

  return {
    spent,
    income,
    limit,
    left: limit === null ? null : limit - spent,
    pct: limit ? Math.min(100, Math.round((spent / limit) * 100)) : null,
    categories,
    overCount: categories.filter((c) => c.over).length,
  };
}

export function formatMoney(amount: number, currency = "INR"): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: Math.abs(amount) >= 1000 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
