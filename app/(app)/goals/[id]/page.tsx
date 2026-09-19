import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ChevronLeft, Lock, Plus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient, getUser } from "@/lib/supabase/server";
import { getWeekStartDay, todayIsoLocal } from "@/lib/dates";
import { addDaysIso, weekStartIsoOf } from "@/lib/week";
import { BIG_GOAL_DAYS, goalArea, horizonLabel, lengthInDays } from "@/lib/goals/constants";
import { isPastEnd, nextCheckinLabel, timeLeftLabel } from "@/lib/goals/progress";
import { loadComments } from "@/components/comments/loadComments";
import { CommentThread } from "@/components/comments/CommentThread";
import { GoalProgressBar } from "@/components/goals/GoalProgressBar";
import { GoalStatusChip } from "@/components/goals/GoalStatusChip";
import { StepList } from "@/components/goals/StepList";
import { CheckInForm } from "@/components/goals/CheckInForm";
import { GoalStatusActions } from "@/components/goals/GoalStatusActions";
import { CheckInHistory } from "@/components/goals/CheckInHistory";
import { LinkedWork } from "@/components/goals/LinkedWork";
import { GoalReview } from "@/components/goals/GoalReview";
import { PlanSection } from "@/components/goals/plan/PlanSection";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CARD = "rounded-xl border border-border bg-card p-4 sm:p-6";

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default async function GoalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const [
    { data: goal },
    { data: steps },
    { data: allGoals },
    { data: entries },
    { data: linkedTasks },
    { data: linkedTodos },
    { data: timeRows },
    comments,
    todayIso,
    weekStartDay,
    { data: reviews },
    { data: profile },
  ] = await Promise.all([
    supabase.from("goals").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle(),
    supabase.from("goal_steps").select("id, title, done_at").eq("goal_id", id).order("position"),
    supabase
      .from("goals")
      .select("id, parent_id, title, status, area, level, start_date, target_date")
      .eq("owner_id", user.id),
    supabase
      .from("journal_entries")
      .select("id, entry_date, title, body, kind, on_track, value")
      .eq("goal_id", id)
      .eq("owner_id", user.id)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("tasks")
      .select("id, name, sprint_id, sprints(week_start_date)")
      .eq("goal_id", id)
      .eq("owner_id", user.id),
    supabase
      .from("todo_tasks")
      .select("id, title, is_completed")
      .eq("goal_id", id)
      .eq("owner_id", user.id)
      .order("is_completed")
      .order("position"),
    supabase
      .from("time_entries")
      .select("duration_hours, daily_logs!inner(log_date), tasks!inner(goal_id)")
      .eq("owner_id", user.id)
      .eq("tasks.goal_id", id),
    loadComments("goal", id),
    todayIsoLocal(),
    getWeekStartDay(),
    supabase
      .from("goal_reviews")
      .select("id, direction, summary, reasons, next_step, input_counts, read_journal, created_at")
      .eq("goal_id", id)
      .order("created_at", { ascending: false })
      .limit(2),
    supabase.from("users").select("coach_reads_journal").eq("id", user.id).single(),
  ]);
  if (!goal) notFound();

  const byId = new Map((allGoals ?? []).map((g) => [g.id, g]));
  const chain: { id: string; title: string }[] = [];
  for (let cursor = goal.parent_id, depth = 0; cursor && depth < 10; depth++) {
    const parent = byId.get(cursor);
    if (!parent) break;
    chain.unshift(parent);
    cursor = parent.parent_id;
  }
  const children = (allGoals ?? []).filter((g) => g.parent_id === id);
  const stepRows = steps ?? [];
  const history = entries ?? [];
  const feelings = history.flatMap((e) => (e.on_track === null ? [] : [e.on_track]));

  const area = goalArea(goal.area);
  const closed = goal.status === "done" || goal.status === "let_go";
  const pastEnd = isPastEnd(goal, todayIso);
  const targetLabel = format(new Date(`${goal.target_date}T00:00:00`), "d MMM yyyy");

  // Hours come from time logged against sprint tasks linked to this goal.
  const weekStart = weekStartIsoOf(todayIso, weekStartDay);
  const monthStart = `${todayIso.slice(0, 8)}01`;
  const quietSince = addDaysIso(todayIso, -21);
  let hoursWeek = 0;
  let hoursMonth = 0;
  let hoursTotal = 0;
  let lastWorkedOn = "";
  for (const entry of timeRows ?? []) {
    const h = Number(entry.duration_hours || 0);
    const date = one(entry.daily_logs as { log_date: string } | { log_date: string }[] | null)?.log_date;
    hoursTotal += h;
    if (!date) continue;
    if (date >= weekStart) hoursWeek += h;
    if (date >= monthStart) hoursMonth += h;
    if (date > lastWorkedOn) lastWorkedOn = date;
  }
  const quiet =
    goal.status === "active" &&
    goal.start_date <= quietSince &&
    lastWorkedOn < quietSince &&
    (goal.last_checkin_on ?? "") < quietSince;

  const tasks = (linkedTasks ?? [])
    .map((t) => ({
      id: t.id,
      name: t.name,
      sprintId: t.sprint_id,
      weekStart:
        one(t.sprints as { week_start_date: string } | { week_start_date: string }[] | null)
          ?.week_start_date ?? null,
    }))
    .sort((a, b) => (b.weekStart ?? "").localeCompare(a.weekStart ?? ""));

  return (
    <div className="space-y-6">
      <Link href="/goals" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" />
        Goals
      </Link>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", area.dot)} aria-hidden />
            {area.label}
          </span>
          <span>{horizonLabel(goal.horizon, goal.start_date, goal.target_date)}</span>
          <span>{closed ? `End date ${targetLabel}` : `Ends ${targetLabel} · ${timeLeftLabel(goal.target_date, todayIso)}`}</span>
          <GoalStatusChip status={goal.status} />
          <span className="inline-flex items-center gap-1">
            {goal.is_private ? <Lock className="h-3 w-3" /> : <Users className="h-3 w-3" />}
            {goal.is_private ? "Only you" : "Shared with your reviewers"}
          </span>
        </div>
        <h1 className="text-balance text-2xl font-bold text-foreground">{goal.title}</h1>
        {chain.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Part of{" "}
            {chain.map((g, i) => (
              <Fragment key={g.id}>
                <Link href={`/goals/${g.id}`} className="text-foreground hover:text-primary">
                  {g.title}
                </Link>
                {i < chain.length - 1 && " › "}
              </Fragment>
            ))}
          </p>
        )}
        {goal.why && <p className="max-w-prose text-sm leading-relaxed text-foreground/80">{goal.why}</p>}
      </header>

      {pastEnd && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
          The end date has passed. Choose what&apos;s true now: extend it, mark it done, or let it go.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-6">
          <section className={CARD}>
            <h2 className="mb-3 text-lg font-semibold text-foreground">Progress</h2>
            <GoalProgressBar
              trackType={goal.track_type}
              startValue={goal.start_value}
              targetValue={goal.target_value}
              currentValue={goal.current_value}
              unit={goal.unit}
              stepsDone={stepRows.filter((s) => s.done_at).length}
              stepsTotal={stepRows.length}
              feelings={feelings}
            />
            {goal.track_type === "steps" && <StepList goalId={goal.id} steps={stepRows} readOnly={closed} />}
          </section>

          <PlanSection
            goal={goal}
            allGoals={allGoals ?? []}
            ownerId={user.id}
            todayIso={todayIso}
            readOnly={closed}
          />

          {!closed && (
            <section id="check-in" className={cn(CARD, "scroll-mt-20")}>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold text-foreground">Check in</h2>
                <span className="text-xs text-muted-foreground">
                  {goal.status === "paused" ? "Paused, so no reminders" : nextCheckinLabel(goal, todayIso)}
                </span>
              </div>
              <CheckInForm
                goal={{
                  id: goal.id,
                  trackType: goal.track_type,
                  unit: goal.unit,
                  currentValue: goal.current_value,
                  startValue: goal.start_value,
                  isPrivate: goal.is_private,
                }}
              />
            </section>
          )}

          <LinkedWork
            hoursWeek={hoursWeek}
            hoursMonth={hoursMonth}
            hoursTotal={hoursTotal}
            quiet={quiet}
            tasks={tasks}
            todos={linkedTodos ?? []}
          />

          <GoalReview
            goalId={goal.id}
            latest={reviews?.[0] ?? null}
            previous={reviews?.[1] ?? null}
            coachReadsJournal={profile?.coach_reads_journal ?? false}
          />

          <CheckInHistory entries={history} unit={goal.unit} />

          {!goal.is_private && (
            <section className={CARD}>
              <h2 className="mb-3 text-lg font-semibold text-foreground">Comments from your reviewers</h2>
              <CommentThread
                targetType="goal"
                targetId={goal.id}
                ownerId={user.id}
                currentUserId={user.id}
                initialComments={comments}
                revalidatePaths={[`/goals/${goal.id}`]}
              />
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <section className={CARD}>
            <h2 className="mb-3 text-sm font-semibold text-foreground">Smaller goals</h2>
            {children.length > 0 ? (
              <ul className="mb-3 space-y-1.5">
                {children.map((child) => (
                  <li key={child.id} className="flex min-w-0 items-center gap-2 text-sm">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", goalArea(child.area).dot)} aria-hidden />
                    <Link href={`/goals/${child.id}`} className="min-w-0 flex-1 truncate text-foreground hover:text-primary">
                      {child.title}
                    </Link>
                    {child.status !== "active" && <GoalStatusChip status={child.status} />}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-3 text-xs text-muted-foreground">
                {lengthInDays(goal.start_date, goal.target_date) > BIG_GOAL_DAYS
                  ? "What's one thing you could do in the next three months?"
                  : "Break this into smaller goals if it helps."}
              </p>
            )}
            {!closed && (
              <Link
                href={`/goals/new?parent=${goal.id}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Plus className="h-3.5 w-3.5" />
                Add a smaller goal
              </Link>
            )}
          </section>

          <section className={CARD}>
            <h2 className="mb-2 text-sm font-semibold text-foreground">Manage</h2>
            <GoalStatusActions
              goal={{
                id: goal.id,
                status: goal.status,
                pinned: goal.pinned,
                startDate: goal.start_date,
                targetDate: goal.target_date,
              }}
              pastEnd={pastEnd}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}
