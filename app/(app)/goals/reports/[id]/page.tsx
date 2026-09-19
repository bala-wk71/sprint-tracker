import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ChevronLeft, MessageSquare } from "lucide-react";
import { createClient, getUser } from "@/lib/supabase/server";
import { todayIsoLocal } from "@/lib/dates";
import { periodLabel, type ReportPeriod } from "@/lib/planning/periods";
import { planDraftSchema } from "@/lib/planning/draft";
import type { ReportNumbers } from "@/lib/planning/report";
import type { ReportWords, WrittenPeriod } from "@/lib/ai/reports";
import { StreamReport } from "@/components/goals/reports/StreamReport";
import { WriteReportButton } from "@/components/goals/reports/WriteReportButton";
import { ProposalReview } from "@/components/goals/reports/ProposalReview";

export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KIND: Record<WrittenPeriod, string> = { month: "Monthly report", quarter: "Quarterly review", year: "Yearly review" };
const d = (iso: string) => format(new Date(`${iso}T00:00:00`), "d MMM yyyy");

type Proposal = { draft: unknown; warnings?: string[]; savedAt?: string | null } | null;

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const { data: report } = await supabase
    .from("plan_reports")
    .select("id, period, period_start, period_end, as_of, numbers, words, proposal, updated_at")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!report) notFound();

  const period = report.period as WrittenPeriod;
  const [todayIso, { data: previous }, { data: streams }] = await Promise.all([
    todayIsoLocal(),
    supabase
      .from("plan_reports")
      .select("id, period_start, numbers")
      .eq("owner_id", user.id)
      .eq("period", period)
      .lt("period_start", report.period_start)
      .order("period_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("streams").select("name").eq("owner_id", user.id).is("archived_at", null),
  ]);

  const numbers = report.numbers as unknown as ReportNumbers;
  const words = report.words as unknown as ReportWords;
  const before = (previous?.numbers ?? null) as unknown as ReportNumbers | null;
  const wordsFor = (name: string) => words.streams.find((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase()) ?? null;
  const proposal = report.proposal as Proposal;
  const proposalDraft = proposal ? planDraftSchema.safeParse(proposal.draft) : null;
  const inProgress = report.as_of < report.period_end;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/goals/reports" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" />
        Reports
      </Link>

      <header className="space-y-3">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{KIND[period]}</p>
          <h1 className="text-2xl font-bold text-foreground">{periodLabel(period as ReportPeriod, report.period_start)}</h1>
          <p className="text-xs text-muted-foreground">
            {inProgress ? `Numbers up to ${d(report.as_of)}, while the period was still running.` : `${d(report.period_start)} to ${d(report.period_end)}.`}
            {previous && (
              <>
                {" "}
                Compared with{" "}
                <Link href={`/goals/reports/${previous.id}`} className="font-medium text-primary hover:underline">
                  {periodLabel(period as ReportPeriod, previous.period_start)}
                </Link>
                .
              </>
            )}
          </p>
        </div>
        <p className="text-lg leading-snug text-foreground">{words.headline}</p>
        {words.nextFocus && (
          <p className="rounded-lg bg-primary/10 px-4 py-3 text-sm text-foreground">
            <span className="font-semibold">Focus: </span>
            {words.nextFocus}
          </p>
        )}
        <div className="flex flex-wrap items-start gap-2">
          <WriteReportButton period={period} start={report.period_start} label="Rewrite with today's numbers" rewrite primary={false} />
          <Link
            href="/goals/plan"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            <MessageSquare className="h-4 w-4" />
            Talk it over with the coach
          </Link>
        </div>
      </header>

      {proposalDraft?.success &&
        (proposal?.savedAt ? (
          <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            Next quarter&apos;s plan from this review was saved on {d(proposal.savedAt)}.{" "}
            <Link href="/goals" className="font-medium text-primary hover:underline">
              See your goals
            </Link>
          </p>
        ) : (
          <ProposalReview
            // A rewrite brings a new proposal; start the review over from it.
            key={report.updated_at}
            reportId={report.id}
            draft={proposalDraft.data}
            warnings={proposal?.warnings ?? []}
            todayIso={todayIso}
            existingStreams={(streams ?? []).map((s) => s.name)}
          />
        ))}

      <div className="space-y-4">
        {numbers.streams.map((s) => (
          <StreamReport
            key={s.id ?? "none"}
            stream={s}
            period={period}
            words={wordsFor(s.name)}
            previous={before?.streams.find((p) => p.id === s.id) ?? null}
          />
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        The numbers are worked out by the app; the words are the AI&apos;s reading of them. Written{" "}
        {format(new Date(report.updated_at), "d MMM yyyy")}.
      </p>
    </div>
  );
}
