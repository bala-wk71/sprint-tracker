import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ChevronLeft, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient, getUser } from "@/lib/supabase/server";
import { getWeekStartDay, todayIsoLocal } from "@/lib/dates";
import { weekStartIsoOf } from "@/lib/week";
import { goalArea } from "@/lib/goals/constants";
import { goalLevelLabel } from "@/lib/planning/constants";
import { loadStreamsOverview } from "@/lib/planning/streams";
import { loadLeverSummaries } from "@/lib/planning/load";
import { coveredLabel, headline } from "@/lib/planning/wording";
import { HoursBar } from "@/components/goals/plan/StreamsOverview";
import { StatusChip } from "@/components/goals/plan/MeasureCard";
import { LeverRow } from "@/components/goals/plan/LeverList";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CARD = "rounded-xl border border-border bg-card p-4 sm:p-6";

/** One front of life on one page: its targets, this week's actions, and the goals under it. */
export default async function StreamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const todayIso = await todayIsoLocal();
  const weekStart = weekStartIsoOf(todayIso, await getWeekStartDay());
  const [overview, { data: allGoals }] = await Promise.all([
    loadStreamsOverview(supabase, user.id, todayIso, weekStart, id),
    supabase.from("goals").select("id, parent_id").eq("owner_id", user.id),
  ]);
  const stream = overview[0];
  if (!stream) notFound();

  const levers = await loadLeverSummaries(
    supabase,
    user.id,
    stream.goals.map((g) => g.id),
    allGoals ?? [],
    todayIso,
    weekStart
  );
  const titleOf = new Map(stream.goals.map((g) => [g.id, g.title]));
  const area = goalArea(stream.area);

  return (
    <div className="space-y-6">
      <Link href="/goals" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" />
        Goals
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn("h-2 w-2 rounded-full", area.dot)} aria-hidden />
            {area.label} · stream
          </p>
          <h1 className="text-2xl font-bold text-foreground">{stream.name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/goals/streams" className="rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-accent">
            Edit streams
          </Link>
          <Link
            href={`/goals/new?stream=${stream.id}`}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            New goal here
          </Link>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <section className={CARD}>
            <h2 className="mb-3 text-lg font-semibold text-foreground">Targets</h2>
            {stream.summaries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                None yet. Open a goal below and set its target and path, or add a goal to this stream.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {stream.summaries.map((s) => (
                  <li key={s.measure.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/goals/${s.measure.goal_id}#plan`} className="font-medium text-foreground hover:text-primary">
                        {s.measure.label}
                      </Link>
                      <StatusChip status={s.status} />
                      {s.due && (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                          Reading due
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-foreground/80">{headline(s, todayIso)}</p>
                    <p className="text-xs text-muted-foreground">
                      {[s.goalTitle, coveredLabel(s)].filter(Boolean).join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={CARD}>
            <h2 className="mb-3 text-lg font-semibold text-foreground">Goals</h2>
            {stream.goals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active goals in this stream.</p>
            ) : (
              <ul className="space-y-2">
                {stream.goals.map((g) => (
                  <li key={g.id} className={cn("flex items-center justify-between gap-3 text-sm", g.parent_id && titleOf.has(g.parent_id) && "pl-4")}>
                    <Link href={`/goals/${g.id}`} className="min-w-0 truncate text-foreground hover:text-primary">
                      {g.title}
                    </Link>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {[goalLevelLabel(g.level), `ends ${format(new Date(`${g.target_date}T00:00:00`), "d MMM yyyy")}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className={CARD}>
            <h2 className="mb-3 text-sm font-semibold text-foreground">This week</h2>
            <HoursBar done={stream.hoursWeek} planned={stream.weeklyHours} />
            {levers.length > 0 ? (
              <ul className="mt-2 divide-y divide-border">
                {levers.map((l) => (
                  <LeverRow key={l.id} lever={l} goalTitle={titleOf.get(l.goal_id)} />
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                Add weekly actions on a goal&apos;s page and they show up here.
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
