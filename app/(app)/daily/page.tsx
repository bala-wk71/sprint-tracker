import { format, startOfWeek } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import type { TaskCategory } from "@/lib/constants";
import { DateNav } from "./DateNav";
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

function todayIsoLocal(): string {
  const now = new Date();
  const tz = now.getTimezoneOffset();
  return new Date(now.getTime() - tz * 60 * 1000).toISOString().slice(0, 10);
}

export default async function DailyPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const todayIso = todayIsoLocal();
  const date =
    params.date && isValidIsoDate(params.date) ? params.date : todayIso;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Fetch the daily log for (user, date) — may not exist yet.
  const { data: dailyLog } = await supabase
    .from("daily_logs")
    .select(
      "id, morning_mood, morning_energy, daily_intention, closing_mood, productivity_rating, reflection, reflection_private, improvement, win, gratitude, gratitude_private"
    )
    .eq("owner_id", user.id)
    .eq("log_date", date)
    .maybeSingle();

  // Priorities + time entries depend on whether the log exists.
  let morningPriorities: MorningPriority[] = [];
  let eveningPriorities: EveningPriority[] = [];
  let timeEntries: DisplayTimeEntry[] = [];

  if (dailyLog) {
    const { data: priorityRows } = await supabase
      .from("priorities")
      .select("id, position, description, target_hours, status")
      .eq("daily_log_id", dailyLog.id)
      .order("position", { ascending: true });

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

    const { data: entryRows } = await supabase
      .from("time_entries")
      .select(
        "id, task_id, start_time, duration_hours, energy_during, notes, is_private, tasks(name, category)"
      )
      .eq("daily_log_id", dailyLog.id)
      .order("start_time", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

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

  // Sprint for this week — used to populate the time entry task dropdown.
  const monday = format(
    startOfWeek(new Date(`${date}T00:00:00`), { weekStartsOn: 1 }),
    "yyyy-MM-dd"
  );

  const { data: sprint } = await supabase
    .from("sprints")
    .select("id, tasks(id, name, category, position)")
    .eq("owner_id", user.id)
    .eq("week_start_date", monday)
    .maybeSingle();

  const sprintTasks: SprintTaskOption[] = (sprint?.tasks ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category as TaskCategory,
    }));

  // Comments on this day's log (only present once the log row exists).
  const dayComments = dailyLog
    ? await loadComments("daily_log", dailyLog.id)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Daily Log</h1>
          <p className="text-muted-foreground">
            Morning check-in, time entries, and evening wrap-up.
          </p>
        </div>
        <DateNav date={date} todayIso={todayIso} />
      </div>

      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Morning check-in
        </h2>
        <MorningCheckIn
          date={date}
          initialMood={dailyLog?.morning_mood ?? null}
          initialEnergy={dailyLog?.morning_energy ?? null}
          initialIntention={dailyLog?.daily_intention ?? ""}
          initialPriorities={morningPriorities}
        />
      </section>

      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Time entries</h2>
        <TimeEntries date={date} tasks={sprintTasks} initialEntries={timeEntries} />
      </section>

      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Evening wrap-up
        </h2>
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
        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            Feedback
          </h2>
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
