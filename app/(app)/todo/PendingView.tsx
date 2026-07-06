"use client";

import { CheckCircle2 } from "lucide-react";
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
      <div className="rounded-xl border border-dashed border-border py-16 text-center">
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-primary/60" />
        <p className="text-sm font-medium text-foreground">All clear</p>
        <p className="mt-1 text-xs text-muted-foreground">
          No pending tasks in any section.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.label} className="rounded-xl border border-border bg-card p-3 sm:p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </p>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
              {group.tasks.length}
            </span>
          </div>
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
