import Link from "next/link";
import { format } from "date-fns";
import { Check, CircleDot, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { goalArea } from "@/lib/goals/constants";
import { formatMeasure } from "@/lib/planning/format";
import { changeText, movedItText, type LeverNumbers, type MeasureNumbers, type StreamNumbers } from "@/lib/planning/report";
import type { ReportPeriod } from "@/lib/planning/periods";
import { StatusChip } from "@/components/goals/plan/MeasureCard";
import { HoursBar } from "@/components/goals/plan/StreamsOverview";

const short = (iso: string) => format(new Date(`${iso}T00:00:00`), "d MMM");
const fmt = (n: number) => formatMeasure(n, null);

const PERIOD_WORD: Record<ReportPeriod, string> = { week: "this week", month: "this month", quarter: "this quarter", year: "this year" };

/** One target: where it ended, how it moved, checkpoints reached, and what helped. */
function MeasureLine({ m, period, previous }: { m: MeasureNumbers; period: ReportPeriod; previous?: MeasureNumbers }) {
  const moved = changeText(m.change, m.unit);
  return (
    <li className="space-y-1 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/goals/${m.goalId}#plan`} className="font-medium text-foreground hover:text-primary">
          {m.label}
        </Link>
        <StatusChip status={m.status} />
      </div>
      <p className="text-sm text-foreground/80">{m.headline}</p>
      <p className="text-xs text-muted-foreground">
        {[
          m.endValue !== null ? `${formatMeasure(m.endValue, m.unit)}${moved ? `, ${moved} ${PERIOD_WORD[period]}` : ""}` : `No reading ${PERIOD_WORD[period]}`,
          previous?.endValue != null ? `last time ${formatMeasure(previous.endValue, m.unit)}` : null,
          m.goalTitle,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {m.checkpoints.map((c) => (
        <p key={c.date} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {c.hit ? (
            <Check className="h-3.5 w-3.5 text-progress-good" aria-hidden />
          ) : (
            <CircleDot className="h-3.5 w-3.5" aria-hidden />
          )}
          {c.label ?? short(c.date)}: {c.target}
          {c.value !== null ? ` · ${formatMeasure(c.value, m.unit)}, ${c.hit ? "reached" : "still to reach"}` : " · no reading near the date"}
        </p>
      ))}
      {m.forecast && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {m.forecast}
        </p>
      )}
      {m.movedIt.map((x) => (
        <p key={x.leverId} className="rounded-md bg-primary/5 px-2 py-1 text-xs text-foreground/80">
          {movedItText(x, m.unit)}
        </p>
      ))}
    </li>
  );
}

/** A weekly action across the period: one square per week, filled at target, half at the minimum. */
function LeverLine({ l }: { l: LeverNumbers }) {
  const h = l.source === "linked_hours" ? "h" : "";
  const unit = l.period === "week" ? "week" : "month";
  const single = l.counts.length === 1;
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm text-foreground">{l.title}</p>
        <p className="text-xs text-muted-foreground">
          {single
            ? `${fmt(l.counts[0].done)}${h} of ${fmt(l.target)}${h}${l.counts[0].partial ? " so far" : ""}${l.counts[0].done >= l.target ? ": target hit" : l.counts[0].done >= l.floor ? ": minimum kept" : ""}`
            : l.complete
              ? `At target ${l.kept} of ${l.complete} ${unit}s · minimum kept ${l.floorKept} of ${l.complete}`
              : `Target ${fmt(l.target)}${h} a ${unit}`}
        </p>
      </div>
      {!single && (
        <ol className="flex max-w-full flex-wrap gap-1" aria-label={`${l.title} per ${unit}`}>
          {l.counts.map((c) => (
            <li
              key={c.start}
              title={`${short(c.start)}: ${fmt(c.done)}${h}${c.partial ? " so far" : ""}`}
              className={cn(
                "flex h-6 min-w-6 items-center justify-center rounded px-1 text-[11px] font-medium tabular-nums",
                c.done >= l.target
                  ? "bg-primary text-primary-foreground"
                  : c.done >= l.floor
                    ? "bg-primary/25 text-foreground"
                    : "border border-border text-muted-foreground",
                c.partial && "border-dashed"
              )}
            >
              {fmt(c.done)}
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

export function StreamReport({
  stream,
  period,
  words,
  previous,
}: {
  stream: StreamNumbers;
  period: ReportPeriod;
  words?: { summary: string; nextFocus: string } | null;
  previous?: StreamNumbers | null;
}) {
  const area = goalArea(stream.area);
  const previousMeasure = new Map((previous?.measures ?? []).map((m) => [m.id, m]));
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <span className={cn("h-2.5 w-2.5 rounded-full", area.dot)} aria-hidden />
          {stream.id ? (
            <Link href={`/goals/streams/${stream.id}`} className="hover:text-primary">
              {stream.name}
            </Link>
          ) : (
            stream.name
          )}
        </h2>
        {(stream.hoursDone > 0 || stream.hoursPlanned) && !(period === "week" && stream.hoursPlanned) && (
          <span className="text-xs text-muted-foreground">
            {fmt(stream.hoursDone)}h{stream.hoursPlanned ? ` of ${fmt(stream.hoursPlanned)}h planned` : " on linked work"}
          </span>
        )}
      </header>

      {words && (
        <div className="space-y-2">
          <p className="text-sm leading-relaxed text-foreground">{words.summary}</p>
          {words.nextFocus && (
            <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-foreground">
              <span className="font-medium">Next: </span>
              {words.nextFocus}
            </p>
          )}
        </div>
      )}

      {period === "week" && stream.hoursPlanned ? <HoursBar done={stream.hoursDone} planned={stream.hoursPlanned} /> : null}

      {stream.measures.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Targets</h3>
          <ul className="divide-y divide-border">
            {stream.measures.map((m) => (
              <MeasureLine key={m.id} m={m} period={period} previous={previousMeasure.get(m.id)} />
            ))}
          </ul>
        </div>
      )}

      {stream.levers.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Weekly actions</h3>
          <ul className="divide-y divide-border">
            {stream.levers.map((l) => (
              <LeverLine key={l.id} l={l} />
            ))}
          </ul>
        </div>
      )}

      {(stream.stepsDone.length > 0 || stream.todosDone > 0 || stream.projects.length > 0) && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Work done</h3>
          {stream.stepsDone.length > 0 && (
            <ul className="space-y-1">
              {stream.stepsDone.map((s, i) => (
                <li key={`${s.title}-${i}`} className="flex items-start gap-1.5 text-sm text-foreground">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-progress-good" aria-hidden />
                  <span>
                    {s.title} <span className="text-xs text-muted-foreground">· {s.goalTitle}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {stream.todosDone > 0 && (
            <p className="text-xs text-muted-foreground">
              {stream.todosDone} {stream.todosDone === 1 ? "todo" : "todos"} done on these goals.
            </p>
          )}
          {stream.projects.length > 0 && (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {stream.projects.map((p) => (
                <li key={p.id}>
                  <Link href={`/goals/${p.id}`} className="text-foreground hover:text-primary">
                    {p.title}
                  </Link>
                  {p.stepsTotal > 0 && ` · ${p.stepsDone} of ${p.stepsTotal} ${p.stepsTotal === 1 ? "step" : "steps"}`} · ends{" "}
                  {short(p.targetDate)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
