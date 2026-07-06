import { format, startOfWeek } from "date-fns";
import { Check, MessageSquare, Moon, Sunrise, Timer, type LucideIcon } from "lucide-react";
import { createClient, getUser } from "@/lib/supabase/server";
import type { TaskCategory } from "@/lib/constants";
import { todayIsoLocal } from "@/lib/dates";
import { addDaysIso, elapsedDaysInWeek, expectedByNow } from "@/lib/pace";
import { DateNav } from "./DateNav";
import { DayProgress } from "./DayProgress";
import { FocusToday, type FocusTask } from "./FocusToday";
import { MorningCheckIn, type MorningPriority } from "./MorningCheckIn";
import {
  TimeEntries,
  type DisplayTimeEntry,
  type SprintTaskOption,
} from "./TimeEntries";
import { EveningWrapUp, type EveningPriority } from "./EveningWrapUp";
import { CommentThread } from "@/components/comments/CommentThread";
import { loadComments } from "@/components/comments/loadComments";

type SearchParams = Promise<{ date?: string }>;

function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

export default async function DailyPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const todayIso = await todayIsoLocal();
  const date =
    params.date && isValidIsoDate(params.date) ? params.date : todayIso;

  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  // Sprint for this week — used to populate the time entry task dropdown.
  const monday = format(
    startOfWeek(new Date(`${date}T00:00:00`), { weekStartsOn: 1 }),
    "yyyy-MM-dd"
  );

  // Daily log (may not exist yet) and this week's sprint, fetched in parallel.
  const [{ data: dailyLog }, { data: sprint }] = await Promise.all([
    supabase
      .from("daily_logs")
      .select(
        "id, morning_mood, morning_energy, daily_intention, closing_mood, productivity_rating, reflection, reflection_private, improvement, win, gratitude, gratitude_private"
      )
      .eq("owner_id", user.id)
      .eq("log_date", date)
      .maybeSingle(),
    supabase
      .from("sprints")
      .select("id, tasks(id, name, category, position, target_hours)")
      .eq("owner_id", user.id)
      .eq("week_start_date", monday)
      .maybeSingle(),
  ]);

  // Priorities, time entries, and comments depend on the log existing.
  let morningPriorities: MorningPriority[] = [];
  let eveningPriorities: EveningPriority[] = [];
  let timeEntries: DisplayTimeEntry[] = [];
  let dayComments: Awaited<ReturnType<typeof loadComments>> = [];

  if (dailyLog) {
    const [{ data: priorityRows }, { data: entryRows }, comments] =
      await Promise.all([
        supabase
          .from("priorities")
          .select("id, position, description, target_hours, status")
          .eq("daily_log_id", dailyLog.id)
          .order("position", { ascending: true }),
        supabase
          .from("time_entries")
          .select(
            "id, task_id, start_time, duration_hours, energy_during, notes, is_private, tasks(name, category)"
          )
          .eq("daily_log_id", dailyLog.id)
          .order("start_time", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true }),
        loadComments("daily_log", dailyLog.id),
      ]);

    dayComments = comments;

    morningPriorities = (priorityRows ?? []).map((p) => ({
      position: p.position,
      description: p.description,
      target_hours: Number(p.target_hours),
    }));

    eveningPriorities = (priorityRows ?? []).map((p) => ({
      id: p.id,
      position: p.position,
      description: p.description,
      status: p.status,
    }));

    timeEntries = (entryRows ?? []).map((row) => {
      const task = Array.isArray(row.tasks) ? row.tasks[0] : row.tasks;
      return {
        id: row.id,
        task_id: row.task_id,
        task_name: task?.name ?? null,
        task_category: (task?.category ?? null) as TaskCategory | null,
        start_time: row.start_time,
        duration_hours: Number(row.duration_hours),
        energy_during: row.energy_during,
        notes: row.notes ?? "",
        is_private: row.is_private,
      };
    });
  }

  const sprintTasks: SprintTaskOption[] = (sprint?.tasks ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category as TaskCategory,
    }));

  // Sprint tasks most behind their weekly pace — shown only when viewing
  // today, as suggestions for where the day's hours should go.
  let focusTasks: FocusTask[] = [];
  if (date === todayIso && sprint && (sprint.tasks ?? []).length > 0) {
    const elapsedDays = elapsedDaysInWeek(monday, todayIso);
    const { data: weekEntries } = await supabase
      .from("time_entries")
      .select("task_id, duration_hours, daily_logs!inner(log_date)")
      .eq("owner_id", user.id)
      .gte("daily_logs.log_date", monday)
      .lte("daily_logs.log_date", addDaysIso(monday, 6));

    const hoursByTask = new Map<string, number>();
    for (const e of weekEntries ?? []) {
      if (!e.task_id) continue;
      hoursByTask.set(
        e.task_id,
        (hoursByTask.get(e.task_id) ?? 0) + Number(e.duration_hours || 0)
      );
    }

    focusTasks = (sprint.tasks ?? [])
      .map((t) => {
        const targetHours = Number(t.target_hours || 0);
        const actualHours = hoursByTask.get(t.id) ?? 0;
        return {
          id: t.id,
          name: t.name,
          category: t.category as TaskCategory,
          targetHours,
          actualHours,
          behindHours: expectedByNow(targetHours, elapsedDays) - actualHours,
        };
      })
      .filter((t) => t.targetHours > 0 && t.behindHours > 0.5)
      .sort((a, b) => b.behindHours - a.behindHours)
      .slice(0, 3);
  }

  const steps = {
    checkin: Boolean(
      dailyLog && (dailyLog.morning_mood || dailyLog.morning_energy !== null)
    ),
    timeLogged: timeEntries.length > 0,
    wrapup: Boolean(
      dailyLog &&
        (dailyLog.closing_mood || dailyLog.productivity_rating !== null)
    ),
  };
  const hoursLogged = timeEntries.reduce((sum, e) => sum + e.duration_hours, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {date === todayIso
              ? "Today"
              : format(new Date(`${date}T00:00:00`), "EEEE, MMM d")}
          </h1>
          <p className="text-muted-foreground">
            Check in, log your time, wrap up. Three steps, every day.
          </p>
        </div>
        <DateNav date={date} todayIso={todayIso} />
      </div>

      <DayProgress
        steps={steps}
        hoursLogged={hoursLogged}
        isToday={date === todayIso}
      />

      <FocusToday tasks={focusTasks} />

      <section
        id="morning"
        className="scroll-mt-20 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <SectionHeader
          icon={Sunrise}
          title="Morning check-in"
          subtitle="Set the tone — mood, energy, and your top 3 priorities"
          done={steps.checkin}
        />
        <MorningCheckIn
          date={date}
          initialMood={dailyLog?.morning_mood ?? null}
          initialEnergy={dailyLog?.morning_energy ?? null}
          initialIntention={dailyLog?.daily_intention ?? ""}
          initialPriorities={morningPriorities}
        />
      </section>

      <section
        id="time"
        className="scroll-mt-20 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <SectionHeader
          icon={Timer}
          title="Time entries"
          subtitle="Where the hours actually went"
          done={steps.timeLogged}
        />
        <TimeEntries date={date} tasks={sprintTasks} initialEntries={timeEntries} />
      </section>

      <section
        id="evening"
        className="scroll-mt-20 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <SectionHeader
          icon={Moon}
          title="Evening wrap-up"
          subtitle="Close the loop — rate the day and mark your priorities"
          done={steps.wrapup}
        />
        <EveningWrapUp
          date={date}
          initialMood={dailyLog?.closing_mood ?? null}
          initialProductivity={dailyLog?.productivity_rating ?? null}
          initialReflection={dailyLog?.reflection ?? ""}
          initialReflectionPrivate={dailyLog?.reflection_private ?? false}
          initialImprovement={dailyLog?.improvement ?? ""}
          initialWin={dailyLog?.win ?? ""}
          initialGratitude={dailyLog?.gratitude ?? ""}
          initialGratitudePrivate={dailyLog?.gratitude_private ?? false}
          priorities={eveningPriorities}
        />
      </section>

      {dailyLog && (
        <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
          <SectionHeader
            icon={MessageSquare}
            title="Feedback"
            subtitle="Comments from you and your reviewers"
          />
          <CommentThread
            targetType="daily_log"
            targetId={dailyLog.id}
            ownerId={user.id}
            currentUserId={user.id}
            initialComments={dayComments}
            revalidatePaths={["/daily"]}
          />
        </section>
      )}
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  done,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  done?: boolean;
}) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          done
            ? "bg-[hsl(var(--strong-signal))]/15 text-[hsl(var(--strong-signal))]"
            : "bg-primary/10 text-primary"
        }`}
      >
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          {title}
          {done && (
            <Check className="h-4 w-4 text-[hsl(var(--strong-signal))]" />
          )}
        </h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}
