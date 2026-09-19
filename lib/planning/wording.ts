// The one-line read of a measure: distance covered first, then where it
// stands on the path. Never "behind": a gap is "to catch up", with the next
// checkpoint named so there's something concrete to aim at.

import { format } from "date-fns";
import { formatBand, formatMeasure } from "./format";
import type { MeasureSummary } from "./summary";

const shortDate = (iso: string, todayIso: string) =>
  format(new Date(`${iso}T00:00:00`), iso.slice(0, 4) === todayIso.slice(0, 4) ? "d MMM" : "d MMM yyyy");

/** "6.1 kg down", "₹40,000 up", "Level L2". Null when there's nothing to compare. */
export function movedSoFar(s: MeasureSummary): string | null {
  const unit = s.measure.unit;
  if (s.measure.kind === "ladder") return s.latest ? `Level ${formatMeasure(s.latest.value, "level")}` : null;
  if (!s.path.baseline || !s.latest) return null;
  const delta = s.latest.value - s.path.baseline.value;
  if (Math.abs(delta) < 1e-9) return `Holding at ${formatMeasure(s.latest.value, unit)}`;
  return `${formatMeasure(Math.abs(delta), unit)} ${delta < 0 ? "down" : "up"}`;
}

export function headline(s: MeasureSummary, todayIso: string): string {
  const unit = s.measure.unit;
  if (s.status === "no_plan") return "Add a checkpoint to draw the path.";
  if (s.needsBaseline && !s.path.baseline) return "Log a first measurement to place the path.";
  if (!s.latest) return "No reading yet. Log one to see where you are.";

  const next = s.next
    ? `${formatBand(s.next.min, s.next.max, unit)} by ${shortDate(s.next.date, todayIso)}`
    : null;
  const moved = movedSoFar(s);
  let where: string;
  switch (s.status) {
    case "ahead":
      where = `${formatMeasure(Math.abs(s.lead), unit)} ahead of the path`;
      break;
    case "catching_up":
      where = `${formatMeasure(Math.abs(s.lead), unit)} to catch up${next ? ` for ${next}` : ""}`;
      break;
    case "off_band":
      where = s.bandToday ? `outside ${formatBand(s.bandToday.min, s.bandToday.max, unit)}` : "outside the range";
      break;
    case "on_track":
      where = next ? `on track for ${next}` : "on track";
      break;
    default:
      where = "needs a reading";
  }
  return moved ? `${moved} · ${where}` : where.charAt(0).toUpperCase() + where.slice(1);
}

/** "58% of the way", from the best reading so far. */
export function coveredLabel(s: MeasureSummary): string | null {
  return s.covered === null ? null : `${Math.round(s.covered * 100)}% of the way`;
}
