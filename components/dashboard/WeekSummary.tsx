import Link from "next/link";
import { format } from "date-fns";
import { createClient, getUser } from "@/lib/supabase/server";
import {
  TASK_CATEGORIES,
  MORNING_MOODS,
  EVENING_MOODS,
  type TaskCategory,
  type MorningMood,
  type EveningMood,
} from "@/lib/constants";
import { CategoryBadge } from "@/components/sprint/CategoryBadge";
import { todayIsoLocal } from "@/lib/dates";
import { addDaysIso } from "@/lib/week";
import { elapsedDaysInWeek, paceStatus } from "@/lib/pace";
import { WeeklyReflection } from "@/app/(app)/dashboard/WeeklyReflection";
import { CommentThread } from "@/components/comments/CommentThread";
import { loadComments } from "@/components/comments/loadComments";

const MORNING_EMOJI: Record<MorningMood, string> = Object.fromEntries(
  MORNING_MOODS.map((m) => [m.value, m.emoji])
) as Record<MorningMood, string>;

const EVENING_EMOJI: Record<EveningMood, string> = Object.fromEntries(
  EVENING_MOODS.map((m) => [m.value, m.emoji])
) as Record<EveningMood, string>;

type Props = {
  ownerId: string;
  weekStart: string;
  /** When true, hide editors (weekly reflection) and route day-cell links
   *  to the reviewer-side daily view. */
  readOnly?: boolean;
  /** Path to revalidate when comment mutations occur. */
  revalidatePath?: string;
};

export async function WeekSummary({
  ownerId,
  weekStart,
  readOnly = false,
  revalidatePath,
}: Props) {
  const weekEnd = addDaysIso(weekStart, 6);
  const supabase = await createClient();
  const viewer = await getUser();

  // Sprint (may not exist), the week's daily logs, and todo completions,
  // fetched in parallel. Todos are owner-only (RLS), so skip when reviewing.
  const [{ data: sprint }, { data: dailyLogs }, { count: todosDone }] =
    await Promise.all([
      supabase
        .from("sprints")
        .select(
          "id, week_start_date, notes, reflection_went_well, reflection_improve, reflection_lesson, tasks(id, name, category, target_hours, position)"
        )
        .eq("owner_id", ownerId)
        .eq("week_start_date", weekStart)
        .maybeSingle(),
      supabase
        .from("daily_logs")
        .select(
          "id, log_date, morning_mood, morning_energy, closing_mood, productivity_rating, priorities(id, status), time_entries(task_id, duration_hours)"
        )
        .eq("owner_id", ownerId)
        .gte("log_date", weekStart)
        .lte("log_date", weekEnd)
        .order("log_date", { ascending: true }),
      readOnly
        ? Promise.resolve({ count: null })
        : supabase
            .from("todo_tasks")
            .select("id", { count: "exact", head: true })
            .eq("owner_id", ownerId)
            .eq("is_completed", true)
            .gte("completed_at", `${weekStart}T00:00:00Z`)
            .lt("completed_at", `${addDaysIso(weekEnd, 1)}T00:00:00Z`),
    ]);

  const tasks = (sprint?.tasks ?? [])
    .slice()
    .sort((a, b) => a.position - b.position);

  // Comments thread lives on the sprint row (one thread per week).
  const sprintComments = sprint
    ? await loadComments("sprint", sprint.id)
    : [];

  // Aggregate hours per task across the week.
  const hoursByTask = new Map<string, number>();
  const hoursByCategory = new Map<TaskCategory, number>();
  let totalLogged = 0;
  let untaggedHours = 0;

  for (const log of dailyLogs ?? []) {
    for (const e of log.time_entries ?? []) {
      const hrs = Number(e.duration_hours) || 0;
      totalLogged += hrs;
      if (e.task_id) {
        hoursByTask.set(e.task_id, (hoursByTask.get(e.task_id) ?? 0) + hrs);
      } else {
        untaggedHours += hrs;
      }
    }
  }

  for (const t of tasks) {
    const actual = hoursByTask.get(t.id) ?? 0;
    const cat = t.category as TaskCategory;
    hoursByCategory.set(cat, (hoursByCategory.get(cat) ?? 0) + actual);
  }

  const totalTarget = tasks.reduce(
    (sum, t) => sum + Number(t.target_hours || 0),
    0
  );

  // Pace: how far along the week is, and whether logged hours keep up with
  // the plan. Weeks in progress get live deltas; past weeks show met/short.
  const todayIso = await todayIsoLocal();
  const elapsedDays = elapsedDaysInWeek(weekStart, todayIso);
  const weekInProgress = elapsedDays > 0 && elapsedDays < 7;
  const overallPace = paceStatus(totalTarget, totalLogged, elapsedDays);

  // Productivity & priority completion summary.
  const productivityRatings = (dailyLogs ?? [])
    .map((l) => l.productivity_rating)
    .filter((v): v is number => typeof v === "number");
  const avgProductivity =
    productivityRatings.length > 0
      ? productivityRatings.reduce((a, b) => a + b, 0) /
        productivityRatings.length
      : null;

  let totalPriorities = 0;
  let donePriorities = 0;
  for (const log of dailyLogs ?? []) {
    for (const p of log.priorities ?? []) {
      totalPriorities++;
      if (p.status === "done") donePriorities++;
    }
  }
  const priorityCompletionPct =
    totalPriorities > 0
      ? Math.round((donePriorities / totalPriorities) * 100)
      : null;

  // Daily metrics grid: 7 cells, from the first day of the sprint week.
  const dayCells = Array.from({ length: 7 }, (_, i) => {
    const date = addDaysIso(weekStart, i);
    const log = (dailyLogs ?? []).find((l) => l.log_date === date) ?? null;
    const dayHours = (log?.time_entries ?? []).reduce(
      (sum, e) => sum + (Number(e.duration_hours) || 0),
      0
    );
    const priorities = log?.priorities ?? [];
    const dayDone = priorities.filter((p) => p.status === "done").length;
    return {
      date,
      label: format(new Date(`${date}T00:00:00`), "EEE"),
      dayNum: format(new Date(`${date}T00:00:00`), "d"),
      morningMood: (log?.morning_mood ?? null) as MorningMood | null,
      closingMood: (log?.closing_mood ?? null) as EveningMood | null,
      energy: log?.morning_energy ?? null,
      productivity: log?.productivity_rating ?? null,
      hours: dayHours,
      priorityTotal: priorities.length,
      priorityDone: dayDone,
    };
  });

  // Category breakdown rows.
  const categoryRows = (Object.keys(TASK_CATEGORIES) as TaskCategory[])
    .map((cat) => {
      const target = tasks
        .filter((t) => (t.category as TaskCategory) === cat)
        .reduce((sum, t) => sum + Number(t.target_hours || 0), 0);
      const actual = hoursByCategory.get(cat) ?? 0;
      return { cat, target, actual };
    })
    .filter((row) => row.target > 0 || row.actual > 0);

  return (
    <>
      {/* Summary cards */}
      <div
        className={`grid gap-4 sm:grid-cols-2 ${
          readOnly ? "lg:grid-cols-4" : "lg:grid-cols-3 xl:grid-cols-5"
        }`}
      >
        <SummaryCard
          label="Hours logged"
          value={`${totalLogged.toFixed(1)}h`}
          sub={
            totalTarget > 0
              ? `of ${totalTarget.toFixed(1)}h target${
                  weekInProgress
                    ? overallPace.status === "behind"
                      ? ` · ${Math.abs(overallPace.deltaHours).toFixed(1)}h behind pace`
                      : overallPace.status === "ahead"
                        ? ` · ${overallPace.deltaHours.toFixed(1)}h ahead of pace`
                        : " · on pace"
                    : ""
                }`
              : "no target set"
          }
        />
        <SummaryCard
          label="Tasks"
          value={String(tasks.length)}
          sub={tasks.length === 1 ? "active task" : "active tasks"}
        />
        <SummaryCard
          label="Avg productivity"
          value={
            avgProductivity !== null ? `${avgProductivity.toFixed(1)}/10` : "—"
          }
          sub={
            productivityRatings.length > 0
              ? `${productivityRatings.length} day${productivityRatings.length === 1 ? "" : "s"} logged`
              : "no data yet"
          }
        />
        <SummaryCard
          label="Priorities done"
          value={
            priorityCompletionPct !== null ? `${priorityCompletionPct}%` : "—"
          }
          sub={
            totalPriorities > 0
              ? `${donePriorities} of ${totalPriorities}`
              : "no priorities set"
          }
        />
        {!readOnly && (
          <SummaryCard
            label="Todos done"
            value={String(todosDone ?? 0)}
            sub="completed this week"
          />
        )}
      </div>

      {!sprint ? (
        <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            No sprint for this week
          </h2>
          <p className="text-sm text-muted-foreground">
            {readOnly ? (
              <>
                Nothing planned for the week of{" "}
                {format(new Date(`${weekStart}T00:00:00`), "MMM d, yyyy")} yet.
              </>
            ) : (
              <>
                Head to{" "}
                <Link
                  href="/sprint/setup"
                  className="text-primary hover:underline"
                >
                  Sprint Setup
                </Link>{" "}
                to plan tasks for the week of{" "}
                {format(new Date(`${weekStart}T00:00:00`), "MMM d, yyyy")}.
              </>
            )}
          </p>
        </div>
      ) : (
        <>
          {/* Task progress */}
          <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-foreground">
              Task progress
            </h2>
            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {readOnly ? (
                  "No tasks in this sprint yet."
                ) : (
                  <>
                    No tasks in this sprint yet.{" "}
                    <Link
                      href={`/sprint/${sprint.id}`}
                      className="text-primary hover:underline"
                    >
                      Add some
                    </Link>
                    .
                  </>
                )}
              </p>
            ) : (
              <>
              {/* Mobile: stacked cards — a 6-column table forces sideways scrolling on phones */}
              <ul className="space-y-3 md:hidden">
                {tasks.map((t) => {
                  const target = Number(t.target_hours || 0);
                  const actual = hoursByTask.get(t.id) ?? 0;
                  const pct =
                    target > 0 ? Math.min(100, (actual / target) * 100) : 0;
                  const overTarget = target > 0 && actual > target;
                  return (
                    <li
                      key={t.id}
                      className="rounded-md border border-border bg-background p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 text-sm font-medium text-foreground">
                          {t.name}
                        </p>
                        <PaceCell
                          target={target}
                          actual={actual}
                          elapsedDays={elapsedDays}
                        />
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <CategoryBadge category={t.category as TaskCategory} />
                        <span className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {actual.toFixed(1)}h
                          </span>{" "}
                          of {target.toFixed(1)}h
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full transition-all ${
                              overTarget
                                ? "bg-[hsl(var(--weak-signal))]"
                                : pct >= 100
                                  ? "bg-[hsl(var(--strong-signal))]"
                                  : "bg-primary"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-10 text-right text-xs text-muted-foreground">
                          {target > 0 ? `${Math.round(pct)}%` : "—"}
                        </span>
                      </div>
                    </li>
                  );
                })}
                {untaggedHours > 0 && (
                  <li className="flex items-center justify-between rounded-md border border-dashed border-border bg-background p-3 text-sm">
                    <span className="italic text-muted-foreground">
                      (untagged time)
                    </span>
                    <span className="text-muted-foreground">
                      {untaggedHours.toFixed(1)}h
                    </span>
                  </li>
                )}
              </ul>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="pb-2 font-medium">Task</th>
                      <th className="pb-2 font-medium">Category</th>
                      <th className="pb-2 text-right font-medium">Target</th>
                      <th className="pb-2 text-right font-medium">Actual</th>
                      <th className="pb-2 pl-4 font-medium">Progress</th>
                      <th className="pb-2 pl-4 text-right font-medium">Pace</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((t) => {
                      const target = Number(t.target_hours || 0);
                      const actual = hoursByTask.get(t.id) ?? 0;
                      const pct =
                        target > 0 ? Math.min(100, (actual / target) * 100) : 0;
                      const overTarget = target > 0 && actual > target;
                      return (
                        <tr
                          key={t.id}
                          className="border-b border-border last:border-0"
                        >
                          <td className="py-3 pr-4 font-medium text-foreground">
                            {t.name}
                          </td>
                          <td className="py-3 pr-4">
                            <CategoryBadge category={t.category as TaskCategory} />
                          </td>
                          <td className="py-3 pr-4 text-right text-muted-foreground">
                            {target.toFixed(1)}h
                          </td>
                          <td className="py-3 pr-4 text-right font-medium text-foreground">
                            {actual.toFixed(1)}h
                          </td>
                          <td className="py-3 pl-4">
                            <div className="flex items-center gap-2">
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                                <div
                                  className={`h-full transition-all ${
                                    overTarget
                                      ? "bg-[hsl(var(--weak-signal))]"
                                      : pct >= 100
                                        ? "bg-[hsl(var(--strong-signal))]"
                                        : "bg-primary"
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="w-12 text-right text-xs text-muted-foreground">
                                {target > 0 ? `${Math.round(pct)}%` : "—"}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 pl-4 text-right">
                            <PaceCell
                              target={target}
                              actual={actual}
                              elapsedDays={elapsedDays}
                            />
                          </td>
                        </tr>
                      );
                    })}
                    {untaggedHours > 0 && (
                      <tr className="border-t border-dashed border-border">
                        <td className="py-3 pr-4 italic text-muted-foreground">
                          (untagged time)
                        </td>
                        <td />
                        <td />
                        <td className="py-3 pr-4 text-right text-muted-foreground">
                          {untaggedHours.toFixed(1)}h
                        </td>
                        <td />
                        <td />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </section>

          {/* Category breakdown */}
          {categoryRows.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
              <h2 className="mb-4 text-lg font-semibold text-foreground">
                Category breakdown
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {categoryRows.map(({ cat, target, actual }) => {
                  const pct =
                    target > 0 ? Math.min(100, (actual / target) * 100) : 0;
                  return (
                    <div
                      key={cat}
                      className="rounded-md border border-border bg-background p-3"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <CategoryBadge category={cat} />
                        <span className="text-xs text-muted-foreground">
                          {actual.toFixed(1)}h / {target.toFixed(1)}h
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      {/* 7-day metrics grid */}
      <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Daily metrics
        </h2>
        <div className="overflow-x-auto">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-7 md:min-w-0">
            {dayCells.map((cell) => {
              const isFuture = cell.date > todayIso;
              const isToday = cell.date === todayIso;
              const hasData =
                cell.morningMood ||
                cell.closingMood ||
                cell.energy !== null ||
                cell.productivity !== null ||
                cell.hours > 0 ||
                cell.priorityTotal > 0;
              const cellClass = `rounded-md border p-3 text-xs ${
                isFuture
                  ? "border-dashed border-border bg-background/50 opacity-60"
                  : isToday
                    ? "border-primary/60 bg-primary/5 ring-1 ring-primary/30"
                    : "border-border bg-background"
              }`;
              const inner = (
                <>
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="font-semibold text-foreground">
                      {cell.label}
                    </span>
                    <span className="text-muted-foreground">{cell.dayNum}</span>
                  </div>
                  {hasData ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1 text-base leading-none">
                        {cell.morningMood && (
                          <span title={`Morning: ${cell.morningMood}`}>
                            {MORNING_EMOJI[cell.morningMood]}
                          </span>
                        )}
                        {cell.closingMood && (
                          <span title={`Evening: ${cell.closingMood}`}>
                            {EVENING_EMOJI[cell.closingMood]}
                          </span>
                        )}
                      </div>
                      <div className="text-muted-foreground">
                        {cell.energy !== null && <div>energy {cell.energy}/10</div>}
                        {cell.productivity !== null && (
                          <div>prod {cell.productivity}/10</div>
                        )}
                        <div className="font-semibold text-foreground">
                          {cell.hours.toFixed(1)}h
                        </div>
                        {cell.priorityTotal > 0 && (
                          <div>
                            {cell.priorityDone}/{cell.priorityTotal} done
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground/60">no log</p>
                  )}
                </>
              );
              const href = readOnly
                ? `/review/${ownerId}/daily/${cell.date}`
                : `/daily?date=${cell.date}`;
              return (
                <Link
                  key={cell.date}
                  href={href}
                  className={`${cellClass} transition-colors hover:border-primary`}
                >
                  {inner}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Weekly reflection */}
      {sprint && (
        <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            Weekly reflection
          </h2>
          {readOnly ? (
            <ReflectionReadOnly
              wentWell={sprint.reflection_went_well}
              improve={sprint.reflection_improve}
              lesson={sprint.reflection_lesson}
            />
          ) : (
            <WeeklyReflection
              sprintId={sprint.id}
              initialWentWell={sprint.reflection_went_well ?? ""}
              initialImprove={sprint.reflection_improve ?? ""}
              initialLesson={sprint.reflection_lesson ?? ""}
            />
          )}
        </section>
      )}

      {/* Weekly comments thread */}
      {sprint && viewer && (
        <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            Weekly feedback
          </h2>
          <CommentThread
            targetType="sprint"
            targetId={sprint.id}
            ownerId={ownerId}
            currentUserId={viewer.id}
            initialComments={sprintComments}
            revalidatePaths={revalidatePath ? [revalidatePath] : undefined}
          />
        </section>
      )}
    </>
  );
}

function PaceCell({
  target,
  actual,
  elapsedDays,
}: {
  target: number;
  actual: number;
  elapsedDays: number;
}) {
  if (target <= 0 || elapsedDays === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  // Past weeks: the verdict is final — target met or missed.
  if (elapsedDays === 7) {
    return actual >= target ? (
      <span className="rounded-full bg-[hsl(var(--strong-signal))]/10 px-2 py-0.5 text-xs font-medium text-[hsl(var(--strong-signal))]">
        met
      </span>
    ) : (
      <span className="rounded-full bg-[hsl(var(--strong-noise))]/10 px-2 py-0.5 text-xs font-medium text-[hsl(var(--strong-noise))]">
        {(target - actual).toFixed(1)}h short
      </span>
    );
  }

  const { status, deltaHours } = paceStatus(target, actual, elapsedDays);
  if (status === "behind") {
    return (
      <span className="rounded-full bg-[hsl(var(--strong-noise))]/10 px-2 py-0.5 text-xs font-medium text-[hsl(var(--strong-noise))]">
        {Math.abs(deltaHours).toFixed(1)}h behind
      </span>
    );
  }
  if (status === "ahead") {
    return (
      <span className="rounded-full bg-[hsl(var(--strong-signal))]/10 px-2 py-0.5 text-xs font-medium text-[hsl(var(--strong-signal))]">
        {deltaHours.toFixed(1)}h ahead
      </span>
    );
  }
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      on pace
    </span>
  );
}

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function ReflectionReadOnly({
  wentWell,
  improve,
  lesson,
}: {
  wentWell: string | null;
  improve: string | null;
  lesson: string | null;
}) {
  const empty = !wentWell && !improve && !lesson;
  if (empty) {
    return (
      <p className="text-sm text-muted-foreground">
        No reflection written yet for this week.
      </p>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <ReflectionField label="What went well" value={wentWell} />
      <ReflectionField label="What to improve" value={improve} />
      <ReflectionField label="Lesson learned" value={lesson} />
    </div>
  );
}

function ReflectionField({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-foreground">{label}</p>
      {value ? (
        <p className="whitespace-pre-wrap rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground">
          {value}
        </p>
      ) : (
        <p className="rounded-md border border-dashed border-border bg-background px-3 py-2 text-sm italic text-muted-foreground">
          Not written
        </p>
      )}
    </div>
  );
}
