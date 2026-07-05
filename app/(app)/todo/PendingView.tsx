"use client";

import { TaskItem } from "./TaskItem";
import type { TodoSection, TodoTask } from "./types";

type PendingGroup = {
  label: string;
  tasks: TodoTask[];
};

function collectPending(sections: TodoSection[], prefix = ""): PendingGroup[] {
  const groups: PendingGroup[] = [];
  for (const section of sections) {
    const label = prefix ? `${prefix} › ${section.name}` : section.name;
    const pending = section.tasks.filter((t) => !t.is_completed);
    if (pending.length > 0) {
      groups.push({ label, tasks: pending });
    }
    if (section.subsections.length > 0) {
      groups.push(...collectPending(section.subsections, label));
    }
  }
  return groups;
}

export function PendingView({ sections }: { sections: TodoSection[] }) {
  const groups = collectPending(sections);

  if (groups.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        No pending tasks — all clear!
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.label} className="rounded-xl border border-border bg-card p-3 sm:p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.tasks.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
