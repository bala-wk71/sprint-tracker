import type { TodoSection, TodoTask } from "./types";

// Pure helpers for the section tree. The store applies these optimistically
// before the matching server action runs, so they must never mutate in place.

/** Replace the section with `id` anywhere in the tree. */
export function mapSection(
  sections: TodoSection[],
  id: string,
  fn: (section: TodoSection) => TodoSection
): TodoSection[] {
  return sections.map((s) =>
    s.id === id
      ? fn(s)
      : { ...s, subsections: mapSection(s.subsections, id, fn) }
  );
}

export function removeSection(
  sections: TodoSection[],
  id: string
): TodoSection[] {
  return sections
    .filter((s) => s.id !== id)
    .map((s) => ({ ...s, subsections: removeSection(s.subsections, id) }));
}

export function addSection(
  sections: TodoSection[],
  parentId: string | null,
  section: TodoSection
): TodoSection[] {
  if (!parentId) return [...sections, section];
  return mapSection(sections, parentId, (s) => ({
    ...s,
    subsections: [...s.subsections, section],
  }));
}

/** Apply `fn` to every section's task list. */
export function mapTasks(
  sections: TodoSection[],
  fn: (tasks: TodoTask[]) => TodoTask[]
): TodoSection[] {
  return sections.map((s) => ({
    ...s,
    tasks: fn(s.tasks),
    subsections: mapTasks(s.subsections, fn),
  }));
}

export function updateTask(
  sections: TodoSection[],
  taskId: string,
  fn: (task: TodoTask) => TodoTask
): TodoSection[] {
  return mapTasks(sections, (tasks) =>
    tasks.map((t) => (t.id === taskId ? fn(t) : t))
  );
}

export function removeTask(
  sections: TodoSection[],
  taskId: string
): TodoSection[] {
  return mapTasks(sections, (tasks) => tasks.filter((t) => t.id !== taskId));
}

export function addTask(
  sections: TodoSection[],
  sectionId: string,
  task: TodoTask
): TodoSection[] {
  return mapSection(sections, sectionId, (s) => ({
    ...s,
    tasks: [...s.tasks, task],
  }));
}

/** Swap the item at `from` with the one at `to`. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Move a task one slot in `direction`, hopping over completed tasks — those
 * live in the Completed tab, so landing on one would look like nothing moved.
 * Returns null when the task is already at that end.
 */
export function moveTaskInList(
  tasks: TodoTask[],
  taskId: string,
  direction: -1 | 1
): TodoTask[] | null {
  const from = tasks.findIndex((t) => t.id === taskId);
  if (from === -1) return null;
  let to = from + direction;
  while (to >= 0 && to < tasks.length && tasks[to].is_completed) to += direction;
  if (to < 0 || to >= tasks.length) return null;
  return moveItem(tasks, from, to);
}

/** Whether a task has a pending neighbour to move towards. */
export function canMoveTask(
  tasks: TodoTask[],
  taskId: string,
  direction: -1 | 1
): boolean {
  return moveTaskInList(tasks, taskId, direction) !== null;
}

/**
 * Narrow the tree to what matches `query`. A section whose own name matches
 * keeps all of its contents; otherwise it keeps only its matching tasks and
 * survives if anything below it matched.
 */
export function filterTree(
  sections: TodoSection[],
  query: string
): TodoSection[] {
  const q = query.trim().toLowerCase();
  if (!q) return sections;

  const out: TodoSection[] = [];
  for (const section of sections) {
    if (section.name.toLowerCase().includes(q)) {
      out.push(section);
      continue;
    }
    const tasks = section.tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q)
    );
    const subsections = filterTree(section.subsections, query);
    if (tasks.length > 0 || subsections.length > 0) {
      out.push({ ...section, tasks, subsections });
    }
  }
  return out;
}

export function countTasks(sections: TodoSection[]): {
  pending: number;
  completed: number;
} {
  let pending = 0;
  let completed = 0;
  for (const section of sections) {
    for (const task of section.tasks) {
      if (task.is_completed) completed += 1;
      else pending += 1;
    }
    const sub = countTasks(section.subsections);
    pending += sub.pending;
    completed += sub.completed;
  }
  return { pending, completed };
}
