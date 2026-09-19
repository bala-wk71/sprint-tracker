// Report numbers as plain text for the AI to write from. Every figure the
// report may quote is spelled out here, already formatted, so the model
// explains numbers instead of doing arithmetic. Pure.

import { format } from "date-fns";
import { formatBand, formatMeasure } from "./format";
import { STATUS_COPY } from "./constants";
import { changeText, movedItText, type LeverNumbers, type MeasureNumbers, type ReportNumbers } from "./report";

const d = (iso: string) => format(new Date(`${iso}T00:00:00`), "d MMM yyyy");

function measureLines(m: MeasureNumbers): string[] {
  const parts = [
    m.endValue !== null ? `now ${formatMeasure(m.endValue, m.unit)}` : "no reading in the period",
    changeText(m.change, m.unit) ? `${changeText(m.change, m.unit)} over the period` : null,
    `status: ${STATUS_COPY[m.status].label}`,
    m.band ? `the path says ${formatBand(m.band.min, m.band.max, m.unit)} for now` : null,
    m.covered !== null ? `${Math.round(m.covered * 100)}% of the way from the start (best reading ${formatMeasure(m.best, m.unit)})` : null,
  ].filter(Boolean);
  const lines = [`- ${m.label} (goal “${m.goalTitle}”): ${parts.join("; ")}.`, `  Read: ${m.headline}.`];
  if (m.forecast) lines.push(`  Forecast: ${m.forecast}${m.replan ? " (the needed pace is past the best so far: moving the date is worth offering)" : ""}`);
  if (m.recent) {
    lines.push(`  Against their own recent self: last 4 weeks ${changeText(m.recent.last4, m.unit)}; the 4 weeks before ${changeText(m.recent.prev4, m.unit)}.`);
  }
  for (const c of m.checkpoints) {
    lines.push(
      `  Checkpoint ${c.label ? `“${c.label}” ` : ""}${d(c.date)}: target ${c.target}, ${
        c.value === null ? "no reading near the date" : `${formatMeasure(c.value, m.unit)}, ${c.hit ? "reached" : "not reached"}`
      }.`
    );
  }
  if (m.earlier && m.checkpoints.length) {
    const e = m.earlier;
    lines.push(`  The checkpoint before (${d(e.date)}, ${e.target}) was ${e.hit === null ? "not measured" : e.hit ? "reached" : "not reached"}.`);
  }
  for (const moved of m.movedIt) lines.push(`  What moved it: ${movedItText(moved, m.unit)}`);
  if (m.due) lines.push("  A reading is due.");
  return lines;
}

function leverLine(l: LeverNumbers): string {
  const unit = l.period === "week" ? "week" : "month";
  const h = l.source === "linked_hours" ? " h" : "";
  const counts = l.counts.map((c) => `${formatMeasure(c.done, null)}${h}${c.partial ? " so far" : ""}`).join(", ") || "none yet";
  const judged = l.complete
    ? ` → at target ${l.kept} of ${l.complete} finished ${unit}s, at least the minimum ${l.floorKept} of ${l.complete}`
    : "";
  return `- ${l.title} (on “${l.goalTitle}”; target ${formatMeasure(l.target, null)}${h} a ${unit}, minimum ${formatMeasure(l.floor, null)}${h}): ${counts}${judged}.`;
}

export function reportNumbersText(n: ReportNumbers): string {
  const out = [
    `Period: ${n.label} (${d(n.start)} to ${d(n.end)}), numbers to ${d(n.asOf)}${n.inProgress ? " (still in progress)" : ""}.`,
  ];
  if (n.streams.length === 0) out.push("Nothing was tracked in this period.");
  for (const s of n.streams) {
    out.push("", `## ${s.name}`);
    if (s.hoursDone > 0 || s.hoursPlanned) {
      out.push(`Hours on linked work: ${formatMeasure(s.hoursDone, null)}${s.hoursPlanned ? ` of ${formatMeasure(s.hoursPlanned, null)} planned` : ""}.`);
    }
    if (s.measures.length) out.push("Targets:", ...s.measures.flatMap(measureLines));
    if (s.levers.length) out.push("Weekly actions:", ...s.levers.map(leverLine));
    if (s.stepsDone.length) {
      out.push(`Steps done: ${s.stepsDone.map((x) => `“${x.title}” (${x.goalTitle})`).join("; ")}.`);
    }
    if (s.projects.length) {
      out.push(
        `Quarter goals and projects: ${s.projects
          .map((p) => `“${p.title}” (ends ${d(p.targetDate)}, ${p.stepsDone} of ${p.stepsTotal} ${p.stepsTotal === 1 ? "step" : "steps"})`)
          .join("; ")}.`
      );
    }
    if (s.stepsOpen.length) out.push(`Open steps: ${s.stepsOpen.map((x) => `“${x.title}”`).join("; ")}.`);
    if (s.todosDone) out.push(`Todos done on these goals: ${s.todosDone}.`);
  }
  return out.join("\n");
}
