import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { parseCashewCsv } from "./cashewCsv";

export type SyncResult =
  | { ok: true; added: number; removed: number; total: number; skipped: number }
  | { ok: false; error: string };

const CHUNK = 500;

/**
 * Bring the app in line with a Cashew export.
 *
 * - Rows already here (same external_key) are left alone.
 * - New rows are added.
 * - Synced rows that fall inside the export's date span but are no longer in
 *   it were edited or deleted in Cashew, so they are removed. Rows outside
 *   the span are never touched, so sharing a partial export cannot wipe
 *   older history. Hand-typed rows are never touched either.
 */
export async function syncCashewCsv(
  supabase: SupabaseClient<Database>,
  ownerId: string,
  text: string
): Promise<SyncResult> {
  const parsed = parseCashewCsv(text);
  if (parsed.error) return { ok: false, error: parsed.error };
  if (parsed.txns.length === 0) {
    return { ok: false, error: "No transactions found in that file." };
  }

  let added = 0;
  for (let i = 0; i < parsed.txns.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("money_transactions")
      .upsert(
        parsed.txns.slice(i, i + CHUNK).map((t) => ({
          ...t,
          owner_id: ownerId,
          source: "cashew",
        })),
        { onConflict: "owner_id,external_key", ignoreDuplicates: true }
      )
      .select("id");
    if (error) return { ok: false, error: "Could not save the transactions." };
    added += data?.length ?? 0;
  }

  const dates = parsed.txns.map((t) => t.txn_date).sort();
  const keep = new Set(parsed.txns.map((t) => t.external_key));
  const { data: existing } = await supabase
    .from("money_transactions")
    .select("id, external_key")
    .eq("owner_id", ownerId)
    .eq("source", "cashew")
    .gte("txn_date", dates[0])
    .lte("txn_date", dates[dates.length - 1])
    .limit(20000);

  const stale = (existing ?? [])
    .filter((r) => r.external_key && !keep.has(r.external_key))
    .map((r) => r.id);
  for (let i = 0; i < stale.length; i += CHUNK) {
    await supabase
      .from("money_transactions")
      .delete()
      .in("id", stale.slice(i, i + CHUNK));
  }

  return {
    ok: true,
    added,
    removed: stale.length,
    total: parsed.txns.length,
    skipped: parsed.skipped,
  };
}
