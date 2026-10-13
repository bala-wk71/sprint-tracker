import { parseCsvObjects } from "@/lib/health/csv";

// Reads the CSV that Cashew writes from Settings → Export CSV. Its columns:
//   account, amount, currency, title, note, date, income, type,
//   category name, subcategory name, color, icon, emoji, budget, objective
// Expenses are negative amounts. Columns are matched by name, loosely, so a
// reordered or slightly renamed export still reads.

export type ParsedTxn = {
  txn_date: string;
  amount: number;
  is_income: boolean;
  category: string;
  title: string;
  note: string;
  account: string;
  currency: string;
  external_key: string;
};

export type CashewParse = {
  txns: ParsedTxn[];
  /** Rows left out: unreadable date or amount, zero amounts, corrections. */
  skipped: number;
  error?: string;
};

/** Cashew's own bookkeeping rows; they are not spending. */
const SKIP_CATEGORIES = new Set(["balance correction"]);

function pick(row: Record<string, string>, names: string[]): string {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== "") return value;
  }
  return "";
}

/** "2026-10-03 13:45:00.000", ISO, or dd/mm/yyyy → YYYY-MM-DD. */
export function toIsoDate(raw: string): string | null {
  const s = raw.trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  return null;
}

export function parseCashewCsv(text: string): CashewParse {
  const { headers, rows } = parseCsvObjects(text);
  const lower = headers.map((h) => h.toLowerCase());
  if (!lower.includes("amount") || !lower.includes("date")) {
    return {
      txns: [],
      skipped: 0,
      error:
        "This doesn't look like a Cashew export. It needs at least a date and an amount column.",
    };
  }

  const txns: ParsedTxn[] = [];
  const seen = new Map<string, number>();
  let skipped = 0;

  for (const original of rows) {
    const row: Record<string, string> = {};
    for (const [key, value] of Object.entries(original)) {
      row[key.toLowerCase()] = value;
    }

    const rawDate = pick(row, ["date"]);
    const date = toIsoDate(rawDate);
    const signed = Number(pick(row, ["amount"]).replace(/[^0-9.+-]/g, ""));
    const category =
      pick(row, ["category name", "category"]) || "Uncategorised";

    if (
      !date ||
      !Number.isFinite(signed) ||
      signed === 0 ||
      SKIP_CATEGORIES.has(category.toLowerCase())
    ) {
      skipped++;
      continue;
    }

    const incomeFlag = pick(row, ["income"]).toLowerCase();
    const is_income =
      incomeFlag === "true" || (incomeFlag === "" && signed > 0);
    const title = pick(row, ["title", "name"]).slice(0, 200);
    const account = pick(row, ["account"]).slice(0, 80);
    const currency = pick(row, ["currency"]).toUpperCase();

    // Identity of the row inside Cashew's history. Two genuinely identical
    // purchases (same second, amount, title) are told apart by their order.
    const base = [rawDate, signed, title, account, category].join("|");
    const nth = (seen.get(base) ?? 0) + 1;
    seen.set(base, nth);

    txns.push({
      txn_date: date,
      amount: Math.round(Math.abs(signed) * 100) / 100,
      is_income,
      category: category.slice(0, 80),
      title,
      note: pick(row, ["note"]).slice(0, 1000),
      account,
      currency: /^[A-Z]{3}$/.test(currency) ? currency : "INR",
      external_key: `cashew:${base}#${nth}`.slice(0, 400),
    });
  }

  return { txns, skipped };
}
