import Link from "next/link";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import {
  TASK_CATEGORIES,
  MORNING_MOODS,
  EVENING_MOODS,
  type TaskCategory,
  type MorningMood,
  type EveningMood,
} from "@/lib/constants";
import { CategoryBadge } from "@/components/sprint/CategoryBadge";
import { WeeklyReflection } from "@/app/(app)/dashboard/WeeklyReflection";

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const MORNING_EMOJI: Record<MorningMood, string> = Object.fromEntries(
  MORNING_MOODS.map((m) => [m.value, m.emoji])
) as Record<MorningMood, string>;

const EVENING_EMOJI: Record<EveningMood, string> = Object.fromEntries(
  EVENING_MOODS.map((m) => [m.value, m.emoji])
) as Record<EveningMood, string>;

type Props = {
  ownerId: string;
  weekStart: string;
  /** When true, hide editors (weekly reflection) and disable day-cell links. */
  readOnly?: boolean;
};

export async function WeekSummary({ ownerId, weekStart, readOnly = false }: Props) {
  const weekEnd = addDaysIso(weekStart, 6);
  const supabase = await createClient();

  // Sprint for this week (may not exist).
  const { data: sprint } = await supabase
    .from("sprints")
    .select(
      "id, week_start_date, notes, reflection_went_well, reflection_improve, reflection_lesson, tasks(id, name, category, target_hours, position)"
    )
    .eq("owner_id", ownerId)
    .eq("week_start_date", weekStart)
    .maybeSingle();

  const tasks = (sprint?.tasks ?? [])
    .slice()
    .sort((a, b) => a.position - b.position);

  // All daily logs for the week.
  const { data: dailyLogs } = await supabase
    .from("daily_logs")
    .select(
      "id, log_date, morning_mood, morning_energy, closing_mood, productivity_rating, priorities(id, status), time_entries(task_id, duration_hours)"
    )
    .eq("owner_id", ownerId)
    .gte("log_date", weekStart)
    .lte("log_date", weekEnd)
    .order("log_date", { ascending: true });

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

  // Daily metrics grid: 7 cells (Mon..Sun).
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Hours logged"
          value={`${totalLogged.toFixed(1)}h`}
          sub={
            totalTarget > 0
              ? `of ${totalTarget.toFixed(1)}h target`
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
      </div>

      {!sprint ? (
        <div className="rounded-lg border border-border bg-card p-6">
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
          <section className="rounded-lg border border-border bg-card p-6">
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
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="pb-2 font-medium">Task</th>
                      <th className="pb-2 font-medium">Category</th>
                      <th className="pb-2 text-right font-medium">Target</th>
                      <th className="pb-2 text-right font-medium">Actual</th>
                      <th className="pb-2 pl-4 font-medium">Progress</th>
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
                                      ? "bg-yellow-500"
                                      : pct >= 100
                                        ? "bg-green-500"
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
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Category breakdown */}
          {categoryRows.length > 0 && (
            <section className="rounded-lg border border-border bg-card p-6">
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
      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Daily metrics
        </h2>
        <div className="overflow-x-auto">
          <div className="grid min-w-[640px] grid-cols-7 gap-2">
            {dayCells.map((cell) => {
              const isFuture = new Date(`${cell.date}T00:00:00`) > new Date();
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
              if (readOnly) {
                return (
                  <div key={cell.date} className={cellClass}>
                    {inner}
                  </div>
                );
              }
              return (
                <Link
                  key={cell.date}
                  href={`/daily?date=${cell.date}`}
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
        <section className="rounded-lg border border-border bg-card p-6">
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
    </>
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
    <div className="rounded-lg border border-border bg-card p-4">
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
