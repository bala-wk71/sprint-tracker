// Calendar quarters, and the quarter-by-quarter path between a baseline and
// a goal's checkpoints. Used by "Suggest a path" and the cascade.

import { expectedBand, type Checkpoint, type Path } from "./projection";

export type Quarter = { year: number; q: 1 | 2 | 3 | 4 };

export function quarterOf(iso: string): Quarter {
  const month = Number(iso.slice(5, 7));
  return { year: Number(iso.slice(0, 4)), q: (Math.floor((month - 1) / 3) + 1) as Quarter["q"] };
}

const LAST_DAY = ["03-31", "06-30", "09-30", "12-31"] as const;
const FIRST_DAY = ["01-01", "04-01", "07-01", "10-01"] as const;

export function quarterStartIso({ year, q }: Quarter): string {
  return `${year}-${FIRST_DAY[q - 1]}`;
}

export function quarterEndIso({ year, q }: Quarter): string {
  return `${year}-${LAST_DAY[q - 1]}`;
}

export function quarterLabel({ year, q }: Quarter): string {
  return `Q${q} ${year}`;
}

export function nextQuarter({ year, q }: Quarter): Quarter {
  return q === 4 ? { year: year + 1, q: 1 } : { year, q: (q + 1) as Quarter["q"] };
}

/** Quarter ends strictly after `fromIso` and strictly before `toIso`. */
export function quarterEndsBetween(fromIso: string, toIso: string): { date: string; label: string }[] {
  const out: { date: string; label: string }[] = [];
  for (let quarter = quarterOf(fromIso); ; quarter = nextQuarter(quarter)) {
    const end = quarterEndIso(quarter);
    if (end >= toIso) break;
    if (end > fromIso) out.push({ date: end, label: quarterLabel(quarter) });
  }
  return out;
}

/**
 * Proposed checkpoints for every quarter end between the baseline and the
 * last existing checkpoint, read off the current path. Quarters that already
 * have a checkpoint on their end date are skipped.
 */
export function suggestQuarterCheckpoints(path: Path, round = (n: number) => n): Checkpoint[] {
  if (!path.baseline || path.checkpoints.length === 0) return [];
  const last = [...path.checkpoints].sort((a, b) => a.date.localeCompare(b.date)).at(-1)!;
  const taken = new Set(path.checkpoints.map((c) => c.date));
  return quarterEndsBetween(path.baseline.date, last.date).flatMap(({ date, label }) => {
    if (taken.has(date)) return [];
    const band = expectedBand(path, date);
    if (!band) return [];
    return [
      {
        date,
        label,
        min: band.min === null ? null : round(band.min),
        max: band.max === null ? null : round(band.max),
      },
    ];
  });
}
