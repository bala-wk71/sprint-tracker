import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { createClient, getUser } from "@/lib/supabase/server";
import type { TaskCategory } from "@/lib/constants";
import { TasksEditor, type EditableTask } from "./TasksEditor";
import { DeleteSprintButton } from "./DeleteSprintButton";

export default async function SprintDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const { data: sprint } = await supabase
    .from("sprints")
    .select("id, week_start_date, notes, owner_id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!sprint) {
    notFound();
  }

  const { data: taskRows } = await supabase
    .from("tasks")
    .select("id, name, category, target_hours, is_recurring, position")
    .eq("sprint_id", sprint.id)
    .order("position", { ascending: true });

  const tasks: EditableTask[] = (taskRows ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category as TaskCategory,
    target_hours: Number(t.target_hours),
    is_recurring: t.is_recurring,
  }));

  const totalTarget = tasks.reduce((sum, t) => sum + t.target_hours, 0);

  // Sum of logged hours across all daily logs in this sprint's week.
  const weekStart = sprint.week_start_date;
  const weekEnd = (() => {
    const d = new Date(`${weekStart}T00:00:00`);
    d.setDate(d.getDate() + 6);
    return d.toISOString().slice(0, 10);
  })();
  const { data: entries } = await supabase
    .from("time_entries")
    .select("duration_hours, daily_logs!inner(log_date)")
    .eq("owner_id", user.id)
    .gte("daily_logs.log_date", weekStart)
    .lte("daily_logs.log_date", weekEnd);
  const totalLogged = (entries ?? []).reduce(
    (sum, e) => sum + Number(e.duration_hours || 0),
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/sprint/setup"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            All sprints
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-foreground">
            Week of {format(new Date(sprint.week_start_date), "MMMM d, yyyy")}
          </h1>
          {sprint.notes && (
            <p className="text-sm text-muted-foreground">{sprint.notes}</p>
          )}
        </div>
        <DeleteSprintButton sprintId={sprint.id} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Tasks</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{tasks.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Target hours</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{totalTarget}h</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Logged hours</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {totalLogged.toFixed(1)}h
          </p>
          {totalTarget > 0 && (
            <p className="text-[10px] text-muted-foreground">
              {Math.round((totalLogged / totalTarget) * 100)}% of target
            </p>
          )}
        </div>
      </div>

      <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Tasks</h2>
        <TasksEditor sprintId={sprint.id} initialTasks={tasks} />
      </section>
    </div>
  );
}
