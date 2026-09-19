import Link from "next/link";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient, getUser } from "@/lib/supabase/server";
import { getWeekStartDay, todayIsoLocal } from "@/lib/dates";
import { addDaysIso } from "@/lib/week";
import { buildReportNumbers } from "@/lib/planning/report";
import { periodLabel, periodRange, reportsDue, type ReportPeriod } from "@/lib/planning/periods";
import { StreamReport } from "@/components/goals/reports/StreamReport";
import { WriteReportButton } from "@/components/goals/reports/WriteReportButton";

// Writing a report waits on the AI for up to half a minute.
export const maxDuration = 120;

const KIND: Record<ReportPeriod, string> = {
  week: "Weekly check",
  month: "Monthly report",
  quarter: "Quarterly review",
  year: "Yearly review",
};

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;
  const [todayIso, weekStartDay] = await Promise.all([todayIsoLocal(), getWeekStartDay()]);
  const lastWeek = params.week === "last";
  const weekDate = lastWeek ? addDaysIso(todayIso, -7) : todayIso;

  const [week, { data: saved }] = await Promise.all([
    buildReportNumbers(supabase, user.id, "week", weekDate, todayIso, weekStartDay),
    supabase
      .from("plan_reports")
      .select("id, period, period_start, as_of, words, updated_at")
      .eq("owner_id", user.id)
      .order("period_start", { ascending: false })
      .limit(60),
  ]);
  const written = saved ?? [];
  const isWritten = (period: string, start: string) => written.some((r) => r.period === period && r.period_start === start);
  const thisMonth = periodRange("month", todayIso, weekStartDay);
  const offers = [
    ...reportsDue(todayIso, weekStartDay).filter((r) => r.period !== "week" && !isWritten(r.period, r.start)),
    ...(isWritten("month", thisMonth.start) ? [] : [{ period: "month" as const, ...thisMonth, soFar: true }]),
  ] as { period: "month" | "quarter" | "year"; start: string; end: string; soFar?: boolean }[];

  const levers = week.streams.flatMap((s) => s.levers);
  const hit = levers.filter((l) => l.counts[0] && l.counts[0].done >= l.target).length;
  const readingsDue = week.streams.flatMap((s) => s.measures).filter((m) => m.due).length;
  const stepsDone = week.streams.reduce((n, s) => n + s.stepsDone.length, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <Link href="/goals" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" />
        Goals
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Reports</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Where you are against the plan, what moved it, and what&apos;s next. The weekly check is worked out from
          your numbers; the monthly, quarterly and yearly reports are written by the AI from those same numbers.
        </p>
      </header>

      <section className="space-y-3" aria-labelledby="weekly-check">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="weekly-check" className="text-lg font-semibold text-foreground">
              Weekly check
            </h2>
            <p className="text-sm text-muted-foreground">
              {periodLabel("week", week.start)}
              {week.inProgress && " · so far"}
            </p>
          </div>
          <nav className="inline-flex rounded-md border border-border p-0.5 text-sm" aria-label="Which week">
            {[
              { href: "/goals/reports?week=last", text: "Last week", on: lastWeek, icon: ChevronLeft },
              { href: "/goals/reports", text: "This week", on: !lastWeek, icon: ChevronRight },
            ].map((t) => (
              <Link
                key={t.text}
                href={t.href}
                aria-current={t.on ? "page" : undefined}
                className={cn(
                  "rounded px-3 py-1 font-medium",
                  t.on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.text}
              </Link>
            ))}
          </nav>
        </div>

        {week.streams.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            Nothing to check yet. Give a goal a target or a weekly action and it shows up here.
          </p>
        ) : (
          <>
            <p className="text-sm text-foreground">
              {[
                levers.length ? `${hit} of ${levers.length} weekly ${levers.length === 1 ? "action" : "actions"} at target` : null,
                stepsDone ? `${stepsDone} ${stepsDone === 1 ? "step" : "steps"} done` : null,
                readingsDue ? `${readingsDue} ${readingsDue === 1 ? "reading" : "readings"} due` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "Nothing logged yet this week."}
            </p>
            <div className="space-y-4">
              {week.streams.map((s) => (
                <StreamReport key={s.id ?? "none"} stream={s} period="week" />
              ))}
            </div>
          </>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="written">
        <div>
          <h2 id="written" className="text-lg font-semibold text-foreground">
            Written reports
          </h2>
          <p className="text-sm text-muted-foreground">
            Each takes about 20 seconds and is kept, so you can compare it with the one before.
          </p>
        </div>

        {offers.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2">
            {offers.map((o, i) => (
              <li key={`${o.period}-${o.start}`} className="space-y-3 rounded-xl border border-border bg-card p-4">
                <div>
                  <p className="font-medium text-foreground">
                    {KIND[o.period]}: {periodLabel(o.period, o.start)}
                    {o.soFar && " so far"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {o.period === "quarter"
                      ? "What was reached and why, and a proposed plan for next quarter to review."
                      : o.period === "year"
                        ? "The year against your plan, and whether to pull targets forward or rethink a path."
                        : o.soFar
                          ? "The month up to today, with forecasts."
                          : "Targets against the path, what moved them, and one focus for next month."}
                  </p>
                </div>
                <WriteReportButton period={o.period} start={o.start} label="Write it" primary={i === 0} />
              </li>
            ))}
          </ul>
        )}

        {written.length === 0 ? (
          <p className="text-sm text-muted-foreground">No written reports yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {written.map((r) => {
              const words = (r.words ?? {}) as { headline?: string };
              const period = r.period as ReportPeriod;
              return (
                <li key={r.id}>
                  <Link href={`/goals/reports/${r.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-accent/50">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">
                        {KIND[period]}: {periodLabel(period, r.period_start)}
                      </span>
                      {words.headline && <span className="block truncate text-xs text-muted-foreground">{words.headline}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {format(new Date(`${r.as_of}T00:00:00`), "d MMM")}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
