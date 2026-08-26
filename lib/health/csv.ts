/**
 * A small RFC 4180 reader.
 *
 * Written rather than pulled in: the app already hand-rolls CSV *writing* in
 * app/api/export/route.ts, the exports being read here are machine-generated
 * and well behaved, and a dependency for eighty lines is not worth the weight.
 * Handles quoted fields, escaped quotes, embedded newlines and commas, CRLF,
 * and a UTF-8 BOM — which FitDays' export has.
 */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\r") {
      // Swallowed; the \n that follows ends the row.
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // A trailing newline leaves one empty row; so does a blank line mid-file.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Rows keyed by header name, with the header row consumed. */
export function parseCsvObjects(input: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const raw = parseCsv(input);
  if (raw.length === 0) return { headers: [], rows: [] };

  const headers = raw[0].map((h) => h.trim());
  const rows = raw.slice(1).map((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = (cells[i] ?? "").trim();
    });
    return row;
  });

  return { headers, rows };
}

/** A number, or null for blanks and anything unparseable. */
export function num(value: string | undefined): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^\d.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * `HH:MM:ss` or `MM:ss` to seconds — FitNotes' time column, which omits the
 * hours when there are none.
 */
export function durationToSeconds(value: string | undefined): number | null {
  if (!value || !value.includes(":")) return null;
  const parts = value.split(":").map((p) => Number(p));
  if (parts.some((p) => !Number.isFinite(p))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

const DISTANCE_TO_METRES: Record<string, number> = {
  m: 1,
  km: 1000,
  cm: 0.01,
  in: 0.0254,
  ft: 0.3048,
  yd: 0.9144,
  mi: 1609.344,
};

export function distanceToMetres(
  value: string | undefined,
  unit: string | undefined
): number | null {
  const n = num(value);
  if (n === null) return null;
  const factor = DISTANCE_TO_METRES[(unit ?? "m").trim().toLowerCase()];
  return factor === undefined ? null : n * factor;
}

// Deliberately a plain boolean rather than a `value is string` predicate:
// narrowing an already-string argument leaves `never` in the else branch,
// where toIsoDate still has parsing to do.
export function isIsoDate(value: string | undefined): boolean {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

/**
 * Coerce the date formats a scale app might export into ISO.
 *
 * FitNotes is documented as YYYY-mm-dd, but FitDays' export follows the phone's
 * locale, so the same file is `2026-08-26`, `26/08/2026` or `08/26/2026`
 * depending on whose phone it came off. Ambiguous day/month pairs are resolved
 * by `preferDayFirst`, which the caller decides from the file as a whole.
 */
export function toIsoDate(
  value: string | undefined,
  preferDayFirst: boolean
): string | null {
  if (!value) return null;
  const trimmed = value.trim();

  // Drop a time component if there is one.
  const datePart = trimmed.split(/[ T]/)[0];

  if (isIsoDate(datePart)) return datePart;

  const match = datePart.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!match) return null;

  const a = Number(match[1]);
  const b = Number(match[2]);
  const year = Number(match[3]);

  // A value above 12 can only be the day, whatever the locale claims.
  let day: number;
  let month: number;
  if (a > 12) {
    day = a;
    month = b;
  } else if (b > 12) {
    day = b;
    month = a;
  } else {
    day = preferDayFirst ? a : b;
    month = preferDayFirst ? b : a;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/**
 * Does this file look day-first?
 *
 * Decided across the whole column rather than per row: a single `13/08/2026`
 * anywhere in the file proves the format for every other row in it, which is
 * the only reliable signal when the export carries no locale.
 */
export function detectDayFirst(values: string[]): boolean {
  for (const value of values) {
    const match = value.trim().split(/[ T]/)[0].match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{4}$/);
    if (!match) continue;
    const a = Number(match[1]);
    const b = Number(match[2]);
    if (a > 12) return true;
    if (b > 12) return false;
  }
  // Nothing decisive. Day-first covers most of the world.
  return true;
}
