"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { syncCashewCsv, type SyncResult } from "@/lib/money/import";

export type MoneyResult = { ok: true } | { ok: false; error: string };

async function getUserOrFail() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

const NOT_SIGNED_IN = { ok: false as const, error: "Not signed in" };

/** Upload path for the same Cashew export the share sheet sends. */
export async function importCashewFile(text: string): Promise<SyncResult> {
  const ctx = await getUserOrFail();
  if (!ctx) return NOT_SIGNED_IN;
  const result = await syncCashewCsv(ctx.supabase, ctx.user.id, text);
  if (result.ok) revalidatePath("/money");
  return result;
}

const txnSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  amount: z.number().positive("Enter an amount").max(99_999_999),
  isIncome: z.boolean(),
  category: z.string().trim().min(1, "Pick a category").max(80),
  title: z.string().trim().max(200),
  currency: z.string().regex(/^[A-Z]{3}$/),
});

export async function addTransaction(
  input: z.input<typeof txnSchema>
): Promise<MoneyResult> {
  const ctx = await getUserOrFail();
  if (!ctx) return NOT_SIGNED_IN;
  const parsed = txnSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  const { error } = await ctx.supabase.from("money_transactions").insert({
    owner_id: ctx.user.id,
    txn_date: parsed.data.date,
    amount: parsed.data.amount,
    is_income: parsed.data.isIncome,
    category: parsed.data.category,
    title: parsed.data.title,
    currency: parsed.data.currency,
    source: "manual",
  });
  if (error) return { ok: false, error: "Could not save that." };
  revalidatePath("/money");
  return { ok: true };
}

export async function deleteTransaction(id: string): Promise<MoneyResult> {
  const ctx = await getUserOrFail();
  if (!ctx) return NOT_SIGNED_IN;
  const { error } = await ctx.supabase
    .from("money_transactions")
    .delete()
    .eq("id", id)
    .eq("owner_id", ctx.user.id);
  if (error) return { ok: false, error: "Could not delete that." };
  revalidatePath("/money");
  return { ok: true };
}

const budgetSchema = z.object({
  category: z.string().trim().min(1).max(80),
  // 0 or less clears the budget.
  limit: z.number().max(99_999_999),
});

export async function setBudget(
  input: z.input<typeof budgetSchema>
): Promise<MoneyResult> {
  const ctx = await getUserOrFail();
  if (!ctx) return NOT_SIGNED_IN;
  const parsed = budgetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid amount." };
  const { category, limit } = parsed.data;

  const query =
    limit > 0
      ? ctx.supabase
          .from("money_budgets")
          .upsert(
            { owner_id: ctx.user.id, category, monthly_limit: limit },
            { onConflict: "owner_id,category" }
          )
      : ctx.supabase
          .from("money_budgets")
          .delete()
          .eq("owner_id", ctx.user.id)
          .eq("category", category);
  const { error } = await query;
  if (error) return { ok: false, error: "Could not save the budget." };
  revalidatePath("/money");
  return { ok: true };
}
