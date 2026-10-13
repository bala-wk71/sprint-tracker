import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createClient, getUser } from "@/lib/supabase/server";
import { todayIsoLocal } from "@/lib/dates";
import {
  formatMoney,
  isValidMonth,
  monthRange,
  shiftMonth,
  summariseMonth,
  TOTAL_BUDGET,
  type MoneyTxn,
} from "@/lib/money/summary";
import { BudgetList } from "./BudgetList";
import { TxnList } from "./TxnList";
import { AddTxnForm } from "./AddTxnForm";
import { CashewSync } from "./CashewSync";

type SearchParams = Promise<{
  m?: string;
  sync?: string;
  added?: string;
  removed?: string;
  total?: string;
  why?: string;
}>;

export default async function MoneyPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const todayIso = await todayIsoLocal();
  const thisMonth = todayIso.slice(0, 7);
  const month = isValidMonth(params.m) ? params.m : thisMonth;
  const { from, to } = monthRange(month);

  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const [{ data: txnRows }, { data: budgetRows }, { data: lastSync }, { data: allCats }] =
    await Promise.all([
      supabase
        .from("money_transactions")
        .select("id, txn_date, amount, is_income, category, title, account, currency, source")
        .eq("owner_id", user.id)
        .gte("txn_date", from)
        .lte("txn_date", to)
        .order("txn_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase
        .from("money_budgets")
        .select("category, monthly_limit")
        .eq("owner_id", user.id),
      supabase
        .from("money_transactions")
        .select("created_at, currency")
        .eq("owner_id", user.id)
        .eq("source", "cashew")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("money_transactions")
        .select("category")
        .eq("owner_id", user.id)
        .eq("is_income", false)
        .order("txn_date", { ascending: false })
        .limit(500),
    ]);

  const txns = (txnRows ?? []) as MoneyTxn[];
  const budgets = budgetRows ?? [];
  const summary = summariseMonth(txns, budgets);
  const currency = txns[0]?.currency ?? lastSync?.currency ?? "INR";
  const totalBudget = budgets.find((b) => b.category === TOTAL_BUDGET);
  const knownCategories = [
    ...new Set([
      ...(allCats ?? []).map((c) => c.category),
      ...budgets.map((b) => b.category).filter((c) => c !== TOTAL_BUDGET),
    ]),
  ].sort();

  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric", timeZone: "UTC" }
  );
  const over = summary.categories.filter((c) => c.over).map((c) => c.category);

  const tiles = [
    { label: "Spent", value: formatMoney(summary.spent, currency), tone: "" },
    {
      label: summary.left !== null && summary.left < 0 ? "Over budget" : "Left",
      value:
        summary.left === null
          ? "No budget yet"
          : formatMoney(Math.abs(summary.left), currency),
      tone:
        summary.left === null
          ? "text-muted-foreground"
          : summary.left < 0
            ? "text-progress-danger"
            : "text-progress-good",
    },
    { label: "Income", value: formatMoney(summary.income, currency), tone: "" },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Money</h1>
          <p className="text-muted-foreground">
            {txns.length === 0
              ? "Nothing recorded this month."
              : over.length > 0
                ? `Over budget in ${over.slice(0, 3).join(", ")}${over.length > 3 ? ` and ${over.length - 3} more` : ""}.`
                : summary.limit !== null
                  ? "Every budget is on track."
                  : `${txns.length} transactions this month.`}
          </p>
        </div>
        <div className="flex items-center gap-1 text-sm font-medium">
          <Link
            href={`/money?m=${shiftMonth(month, -1)}`}
            aria-label="Previous month"
            className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="min-w-28 text-center text-foreground">{monthLabel}</span>
          <Link
            href={`/money?m=${shiftMonth(month, 1)}`}
            aria-label="Next month"
            aria-disabled={month >= thisMonth}
            className={`rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground ${month >= thisMonth ? "pointer-events-none opacity-30" : ""}`}
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="rounded-xl border border-border bg-card p-3 sm:p-4"
          >
            <p className="text-xs text-muted-foreground">{t.label}</p>
            <p
              className={`mt-1 truncate text-base font-bold tabular-nums sm:text-xl ${t.tone || "text-foreground"}`}
            >
              {t.value}
            </p>
          </div>
        ))}
      </div>

      {summary.pct !== null && (
        <div
          className="h-2 overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={`${summary.pct}% of the month's budget spent`}
        >
          <div
            className={`h-full rounded-full ${summary.left !== null && summary.left < 0 ? "bg-progress-danger" : summary.pct > 80 ? "bg-progress-warning" : "bg-progress-good"}`}
            style={{ width: `${summary.pct}%` }}
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2 sm:gap-6">
        <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
          <h2 className="mb-3 text-lg font-semibold text-foreground">Budgets</h2>
          <BudgetList
            lines={summary.categories}
            currency={currency}
            totalLimit={totalBudget ? Number(totalBudget.monthly_limit) : null}
          />
        </section>

        <div className="space-y-4 sm:space-y-6">
          <CashewSync
            lastSyncedAt={lastSync?.created_at ?? null}
            banner={
              params.sync === "ok"
                ? {
                    ok: true,
                    text: `Synced. ${params.added ?? 0} new, ${params.removed ?? 0} removed, ${params.total ?? 0} in the file.`,
                  }
                : params.sync === "error"
                  ? { ok: false, text: params.why ?? "The sync failed." }
                  : null
            }
          />
          <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              Add by hand
            </h2>
            <AddTxnForm
              defaultDate={todayIso}
              currency={currency}
              categories={knownCategories}
            />
          </section>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          Transactions
        </h2>
        <TxnList txns={txns} />
      </section>
    </div>
  );
}
