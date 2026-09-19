import Link from "next/link";
import { addDays, format } from "date-fns";
import { BarChart3, FileText, Layers, MessageSquare, Plus } from "lucide-react";
import { createClient, getUser } from "@/lib/supabase/server";
import { getWeekStartDay, todayIsoLocal } from "@/lib/dates";
import { weekStartIsoOf } from "@/lib/week";
import { effectiveStreams, loadStreamsOverview } from "@/lib/planning/streams";
import { periodLabel, reportsDue } from "@/lib/planning/periods";
import { StreamsOverview } from "@/components/goals/plan/StreamsOverview";
import { ACTIVE_GOAL_SOFT_LIMIT } from "@/lib/goals/constants";
import { PlanTabs } from "@/components/goals/PlanTabs";
import { GoalRow, type GoalRowData } from "@/components/goals/GoalRow";

type Row = GoalRowData & { parent_id: string | null; stream_id: string | null; goal_steps: { done_at: string | null }[] };

export default async function GoalsPage() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const [{ data }, todayIso] = await Promise.all([
    supabase
      .from("goals")
      .select(
        "id, parent_id, stream_id, title, area, horizon, start_date, target_date, track_type, start_value, target_value, current_value, unit, status, pinned, is_private, checkin_every_days, last_checkin_on, completed_at, goal_steps(done_at)"
      )
      .eq("owner_id", user.id)
      .order("pinned", { ascending: false })
      .order("target_date", { ascending: true }),
    todayIsoLocal(),
  ]);
  const goals: Row[] = data ?? [];
  const weekStartDay = await getWeekStartDay();
  const weekStart = weekStartIsoOf(todayIso, weekStartDay);
  const due = reportsDue(todayIso, weekStartDay);
  const [streams, { data: writtenDue }] = await Promise.all([
    loadStreamsOverview(supabase, user.id, todayIso, weekStart),
    supabase
      .from("plan_reports")
      .select("period, period_start")
      .eq("owner_id", user.id)
      .in("period_start", due.map((r) => r.start)),
  ]);
  // Only nudge once there's something to report on.
  const unwritten = streams.some((s) => s.summaries.length > 0)
    ? due.filter((r) => !(writtenDue ?? []).some((w) => w.period === r.period && w.period_start === r.start))
    : [];
  const streamNameById = new Map(streams.map((s) => [s.id, s.name]));
  const streamOf = effectiveStreams(goals);

  const feelingIds = goals.filter((g) => g.track_type === "feeling").map((g) => g.id);
  const { data: ratings } = feelingIds.length
    ? await supabase
        .from("journal_entries")
        .select("goal_id, on_track")
        .in("goal_id", feelingIds)
        .not("on_track", "is", null)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500)
    : { data: [] };
  const feelings = new Map<string, number[]>();
  for (const r of ratings ?? []) {
    if (!r.goal_id || r.on_track === null) continue;
    const list = feelings.get(r.goal_id) ?? [];
    if (list.length < 6) list.push(r.on_track);
    feelings.set(r.goal_id, list);
  }
  const titleById = new Map(goals.map((g) => [g.id, g.title]));

  const today = new Date(`${todayIso}T00:00:00`);
  const soonIso = format(addDays(today, 92), "yyyy-MM-dd");
  const yearIso = format(addDays(today, 366), "yyyy-MM-dd");
  const active = goals.filter((g) => g.status === "active");
  const groups = [
    {
      label: "Next few months",
      hint: "Ending in the next three months.",
      items: active.filter((g) => g.target_date <= soonIso),
    },
    {
      label: "This year",
      hint: "Ending in the next twelve months.",
      items: active.filter((g) => g.target_date > soonIso && g.target_date <= yearIso),
    },
    {
      label: "Further out",
      hint: "The big ones. Check in now and then, and keep a smaller goal underneath.",
      items: active.filter((g) => g.target_date > yearIso),
    },
  ].filter((group) => group.items.length > 0);
  const paused = goals.filter((g) => g.status === "paused");
  const closed = goals
    .filter((g) => g.status === "done" || g.status === "let_go")
    .sort((a, b) => (b.completed_at ?? b.target_date).localeCompare(a.completed_at ?? a.target_date));

  const list = (items: Row[]) => (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
      {items.map((g) => (
        <GoalRow
          key={g.id}
          goal={g}
          stepsDone={g.goal_steps.filter((s) => s.done_at).length}
          stepsTotal={g.goal_steps.length}
          feelings={feelings.get(g.id) ?? []}
          parentTitle={g.parent_id ? titleById.get(g.parent_id) ?? null : null}
          todayIso={todayIso}
          streamName={streamNameById.get(streamOf.get(g.id) ?? "") ?? null}
        />
      ))}
    </ul>
  );

  return (
    <div className="space-y-6">
      <PlanTabs />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">Goals</h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            Things bigger than one week, from a fortnight to ten years. The
            longer the goal, the less often it asks you to check in.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/goals/reports"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            <BarChart3 className="h-4 w-4" />
            Reports
          </Link>
          <Link
            href="/goals/plan?mode=import"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            <FileText className="h-4 w-4" />
            Import roadmap
          </Link>
          <Link
            href="/goals/plan"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            <MessageSquare className="h-4 w-4" />
            Plan with the coach
          </Link>
          <Link
            href="/goals/new"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            New goal
          </Link>
        </div>
      </div>

      {unwritten.length > 0 && (
        <Link
          href="/goals/reports"
          className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm hover:bg-primary/10"
        >
          <BarChart3 className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-foreground">
            Ready to write:{" "}
            {unwritten
              .map((r) => `${r.period === "month" ? "" : r.period === "quarter" ? "review of " : "year review "}${periodLabel(r.period, r.start)}`)
              .join(", ")}
          </span>
        </Link>
      )}

      {streams.length > 0 ? (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Streams</h2>
              <p className="text-xs text-muted-foreground">Every front of your life, with its targets and this week&apos;s hours.</p>
            </div>
            <Link href="/goals/streams" className="shrink-0 text-xs font-medium text-primary hover:underline">
              Manage
            </Link>
          </div>
          <StreamsOverview streams={streams} />
        </section>
      ) : (
        goals.length > 0 && (
          <Link
            href="/goals/streams"
            className="flex items-start gap-3 rounded-xl border border-dashed border-border p-4 text-sm hover:border-primary/50"
          >
            <Layers className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              <span className="font-medium text-foreground">Group your goals into streams</span>
              <span className="block text-muted-foreground">
                A job, a business, a startup, health, learning: see each one&apos;s targets and hours at a glance.
              </span>
            </span>
          </Link>
        )
      )}

      {active.length > ACTIVE_GOAL_SOFT_LIMIT && (
        <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You have {active.length} active goals. Three to five tends to work
          best. Pausing one keeps it safe without the reminders.
        </p>
      )}

      {goals.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-6 text-center">
          <p className="font-medium text-foreground">Nothing here yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            A goal can be anything you want to reach: run a half marathon,
            save an emergency fund, become a calmer parent. Pick how long it
            runs and how you&apos;ll know you&apos;re getting there.
          </p>
          <Link
            href="/goals/new"
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Set your first goal
          </Link>
        </div>
      )}

      {groups.map((group) => (
        <section key={group.label} className="space-y-2">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{group.label}</h2>
            <p className="text-xs text-muted-foreground">{group.hint}</p>
          </div>
          {list(group.items)}
        </section>
      ))}

      {paused.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">Paused</h2>
          {list(paused)}
        </section>
      )}

      {closed.length > 0 && (
        <details className="group space-y-2">
          <summary className="cursor-pointer text-sm font-semibold text-foreground">
            Finished and let go ({closed.length})
          </summary>
          <div className="pt-2">{list(closed)}</div>
        </details>
      )}
    </div>
  );
}
