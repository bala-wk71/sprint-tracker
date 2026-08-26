import { detectDayFirst, num, parseCsvObjects, toIsoDate } from "./csv";

/**
 * FitDays' body-composition export.
 *
 * Unlike FitNotes, its column names are not fixed: the app localises headers
 * and different versions ship different metric sets, so columns are matched by
 * fuzzy name rather than assumed by position — and what matched is shown to
 * the user before anything is written.
 */

export type BodyField =
  | "weight_kg"
  | "body_fat_pct"
  | "muscle_mass_kg"
  | "water_pct"
  | "bone_mass_kg"
  | "visceral_fat"
  | "bmi"
  | "bmr"
  | "protein_pct"
  | "subcutaneous_fat_pct"
  | "skeletal_muscle_pct"
  | "metabolic_age";

type Matcher = {
  field: BodyField;
  label: string;
  /** Every term must appear; the first matching header wins. */
  patterns: RegExp[];
  /** lbs → kg when the header says so. */
  weightLike?: boolean;
};

const LB_TO_KG = 0.45359237;

const MATCHERS: Matcher[] = [
  {
    field: "weight_kg",
    label: "Weight",
    patterns: [/^weight/i, /^body\s*weight/i, /^wt\b/i],
    weightLike: true,
  },
  {
    field: "body_fat_pct",
    label: "Body fat %",
    patterns: [/body\s*fat/i, /^fat\s*(%|rate|percent)/i, /^bfr$/i],
  },
  {
    field: "skeletal_muscle_pct",
    label: "Skeletal muscle %",
    patterns: [/skeletal\s*muscle/i],
  },
  {
    field: "muscle_mass_kg",
    label: "Muscle mass",
    patterns: [/muscle\s*(mass|weight)/i, /^muscle$/i],
    weightLike: true,
  },
  {
    field: "water_pct",
    label: "Body water %",
    patterns: [/body\s*water/i, /water\s*(rate|%|percent)/i, /^moisture/i],
  },
  {
    field: "bone_mass_kg",
    label: "Bone mass",
    patterns: [/bone\s*(mass|weight)/i, /^bone$/i],
    weightLike: true,
  },
  {
    field: "visceral_fat",
    label: "Visceral fat",
    patterns: [/visceral/i],
  },
  {
    field: "bmi",
    label: "BMI",
    patterns: [/\bbmi\b/i, /body\s*mass\s*index/i],
  },
  {
    field: "bmr",
    label: "BMR",
    // Word boundaries rather than an exact match: the export writes the unit
    // into the header, so this arrives as "BMR(kcal)", not a bare "BMR".
    patterns: [/\bbmr\b/i, /basal\s*metab/i, /metabolism/i],
  },
  {
    field: "protein_pct",
    label: "Protein %",
    patterns: [/protein/i],
  },
  {
    field: "subcutaneous_fat_pct",
    label: "Subcutaneous fat %",
    patterns: [/subcutaneous/i],
  },
  {
    field: "metabolic_age",
    label: "Metabolic age",
    patterns: [/metabolic\s*age/i, /body\s*age/i],
  },
];

const DATE_PATTERNS = [/^date$/i, /^time$/i, /measur/i, /^日期$/];

export type ColumnMapping = {
  field: BodyField;
  label: string;
  header: string;
  /** Values were read as lbs and converted. */
  convertedFromLbs: boolean;
};

export type ParsedBodyRow = {
  measuredOn: string;
  values: Partial<Record<BodyField, number>>;
};

export type FitdaysParse = {
  dateHeader: string | null;
  mapping: ColumnMapping[];
  unmatchedHeaders: string[];
  rows: ParsedBodyRow[];
  skippedRows: number;
  dateRange: { from: string; to: string } | null;
  warnings: string[];
};

function findDateHeader(headers: string[]): string | null {
  for (const pattern of DATE_PATTERNS) {
    const found = headers.find((h) => pattern.test(h.trim()));
    if (found) return found;
  }
  return null;
}

export function parseFitdaysCsv(text: string): FitdaysParse {
  const { headers, rows } = parseCsvObjects(text);
  const warnings: string[] = [];

  const dateHeader = findDateHeader(headers);
  if (!dateHeader)
    warnings.push(
      "No date column found. Every reading needs a date, so nothing can be imported from this file."
    );

  const used = new Set<string>();
  const mapping: ColumnMapping[] = [];

  for (const matcher of MATCHERS) {
    const header = headers.find(
      (h) =>
        !used.has(h) &&
        h !== dateHeader &&
        matcher.patterns.some((p) => p.test(h.trim()))
    );
    if (!header) continue;
    used.add(header);
    mapping.push({
      field: matcher.field,
      label: matcher.label,
      header,
      convertedFromLbs: Boolean(matcher.weightLike) && /lb/i.test(header),
    });
  }

  const unmatchedHeaders = headers.filter(
    (h) => h !== dateHeader && !used.has(h) && h.trim() !== ""
  );

  const dayFirst = dateHeader
    ? detectDayFirst(rows.map((r) => r[dateHeader] ?? ""))
    : true;

  // One reading per day: a scale stepped on twice in a morning should correct
  // the day's number rather than add a second point, so the last row for a
  // date wins.
  const byDate = new Map<string, Partial<Record<BodyField, number>>>();
  let skippedRows = 0;

  for (const row of rows) {
    const measuredOn = dateHeader ? toIsoDate(row[dateHeader], dayFirst) : null;
    if (!measuredOn) {
      skippedRows++;
      continue;
    }

    const values: Partial<Record<BodyField, number>> = {};
    for (const column of mapping) {
      const value = num(row[column.header]);
      if (value === null) continue;
      values[column.field] = column.convertedFromLbs ? value * LB_TO_KG : value;
    }

    if (Object.keys(values).length === 0) {
      skippedRows++;
      continue;
    }

    byDate.set(measuredOn, { ...(byDate.get(measuredOn) ?? {}), ...values });
  }

  const dates = [...byDate.keys()].sort();
  const parsedRows: ParsedBodyRow[] = dates.map((measuredOn) => ({
    measuredOn,
    values: byDate.get(measuredOn) ?? {},
  }));

  if (mapping.length === 0 && dateHeader)
    warnings.push(
      "None of the columns looked like a body measurement. Check this is the right file."
    );
  if (skippedRows > 0)
    warnings.push(
      `${skippedRows} row${skippedRows === 1 ? "" : "s"} had no usable date or reading and will be ignored.`
    );

  return {
    dateHeader,
    mapping,
    unmatchedHeaders,
    rows: parsedRows,
    skippedRows,
    dateRange:
      dates.length > 0 ? { from: dates[0], to: dates[dates.length - 1] } : null,
    warnings,
  };
}
