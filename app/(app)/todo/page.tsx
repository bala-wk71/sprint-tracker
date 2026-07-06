import { createClient, getUser } from "@/lib/supabase/server";
import { TodoShell } from "./TodoShell";
import type { TodoSection, TodoTask } from "./types";

export default async function TodoPage() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const [{ data: sectionsRaw }, { data: tasksRaw }] = await Promise.all([
    supabase
      .from("todo_sections")
      .select("id, parent_id, name, position, is_collapsed")
      .eq("owner_id", user.id)
      .order("position"),
    supabase
      .from("todo_tasks")
      .select("id, section_id, title, description, is_completed, completed_at, position")
      .eq("owner_id", user.id)
      .order("position"),
  ]);

  const sections = sectionsRaw ?? [];
  const tasks = (tasksRaw ?? []) as TodoTask[];

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

  const pendingCount = tasks.filter((t) => !t.is_completed).length;
  const completedCount = tasks.length - pendingCount;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Todo</h1>
        <p className="text-sm text-muted-foreground">
          Organise tasks by section and subsection.
        </p>
      </div>
      <TodoShell
        sections={tree}
        pendingCount={pendingCount}
        completedCount={completedCount}
      />
    </div>
  );
}
