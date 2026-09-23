import { createClient, getUser } from "@/lib/supabase/server";
import { getWeekStartDay, todayIsoLocal } from "@/lib/dates";
import { loadStreamOptions } from "@/lib/planning/streams";
import { groupGoalOptions } from "@/lib/planning/goalOptions";
import { GoalOptionsProvider } from "@/components/goals/GoalOptions";
import { TodoShell } from "./TodoShell";
import type { TodoSection, TodoTask } from "./types";
import type { Ticks } from "@/lib/craft/checklist";

/** jsonb arrives as Json; keep only the true flags and drop anything odd. */
function normaliseTicks(value: unknown): Ticks {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Ticks = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (val === true) out[key] = true;
  }
  return out;
}

export default async function TodoPage() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const [
    { data: sectionsRaw },
    { data: tasksRaw },
    { data: goalRows },
    streams,
    todayIso,
    { data: rigorRows },
  ] = await Promise.all([
    supabase
      .from("todo_sections")
      .select("id, parent_id, name, position, is_collapsed, archived_at, source_page_id")
      .eq("owner_id", user.id)
      .order("position"),
    supabase
      .from("todo_tasks")
      .select(
        "id, section_id, title, description, is_completed, completed_at, position, due_date, source_page_id, goal_id, note_pages(title), goals(title)"
      )
      .eq("owner_id", user.id)
      .order("position"),
    supabase
      .from("goals")
      .select("id, title, parent_id, stream_id, level, start_date, target_date")
      .eq("owner_id", user.id)
      .in("status", ["active", "paused"])
      .order("target_date"),
    loadStreamOptions(supabase, user.id),
    todayIsoLocal(),
    supabase
      .from("craft_runs")
      .select("task_id, ticks, completed_at")
      .eq("owner_id", user.id),
  ]);

  const sections = sectionsRaw ?? [];

  // One query for every run, indexed here, rather than a join on todo_tasks:
  // most tasks have no checklist and the join would widen every row for the
  // few that do.
  const rigorByTask = new Map(
    (rigorRows ?? []).map((row) => [
      row.task_id,
      {
        ticks: normaliseTicks(row.ticks),
        completed_at: row.completed_at,
      },
    ])
  );

  const tasks: TodoTask[] = (tasksRaw ?? []).map((row) => {
    const { note_pages, goals, ...task } = row;
    const page = Array.isArray(note_pages) ? note_pages[0] : note_pages;
    const goal = Array.isArray(goals) ? goals[0] : goals;
    return {
      ...task,
      source_page_title: page?.title ?? null,
      goal_title: goal?.title ?? null,
      rigor: rigorByTask.get(task.id) ?? null,
    };
  });

  // Group tasks by section
  const tasksBySection = new Map<string, TodoTask[]>();
  for (const task of tasks) {
    const list = tasksBySection.get(task.section_id) ?? [];
    list.push(task);
    tasksBySection.set(task.section_id, list);
  }

  // Build tree: top-level sections with subsections nested inside
  const sectionMap = new Map<string, TodoSection>();
  for (const s of sections) {
    sectionMap.set(s.id, {
      ...s,
      tasks: tasksBySection.get(s.id) ?? [],
      subsections: [],
    });
  }

  const tree: TodoSection[] = [];
  for (const s of sections) {
    const node = sectionMap.get(s.id)!;
    if (s.parent_id) {
      const parent = sectionMap.get(s.parent_id);
      if (parent) parent.subsections.push(node);
    } else {
      tree.push(node);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Todo</h1>
        <p className="text-sm text-muted-foreground">
          Organise tasks by section and subsection.
        </p>
      </div>
      <GoalOptionsProvider goals={groupGoalOptions(goalRows ?? [], streams, todayIso)}>
        <TodoShell sections={tree} weekStartDay={await getWeekStartDay()} />
      </GoalOptionsProvider>
    </div>
  );
}
