"use client";

import { CheckCheck } from "lucide-react";
import { SectionHeader } from "./SectionHeader";
import { TaskItem } from "./TaskItem";
import { TaskInput } from "./TaskInput";
import * as tree from "./tree";
import type { TodoSection } from "./types";

/** Only open tasks live here now — completed ones belong to the Completed tab. */
function TaskList({
  section,
  reorderable,
}: {
  section: TodoSection;
  reorderable: boolean;
}) {
  const pendingTasks = section.tasks.filter((t) => !t.is_completed);

  return (
    <div className="space-y-0.5">
      {pendingTasks.map((task) => (
        <TaskItem
          key={task.id}
          task={task}
          sectionId={reorderable ? section.id : undefined}
          siblings={reorderable ? section.tasks : undefined}
        />
      ))}
      <TaskInput sectionId={section.id} />
    </div>
  );
}

export function SectionCard({
  section,
  siblings,
  forceExpanded,
  onViewCompleted,
}: {
  section: TodoSection;
  siblings: TodoSection[];
  forceExpanded: boolean;
  onViewCompleted?: () => void;
}) {
  const counts = tree.countTasks([section]);
  const total = counts.pending + counts.completed;
  const expanded = forceExpanded || !section.is_collapsed;

  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <SectionHeader
        section={section}
        siblings={siblings}
        parentId={null}
        isSubsection={false}
        forceExpanded={forceExpanded}
        reorderable={!forceExpanded}
      />

      {total > 0 && (
        <div className="ml-9 mt-1 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(counts.completed / total) * 100}%` }}
          />
        </div>
      )}

      {expanded && (
        <div className="mt-2 space-y-4">
          <TaskList section={section} reorderable={!forceExpanded} />

          {section.subsections.map((sub) => (
            <div key={sub.id} className="ml-2 border-l border-border pl-3">
              <SectionHeader
                section={sub}
                siblings={section.subsections}
                parentId={section.id}
                isSubsection
                forceExpanded={forceExpanded}
                reorderable={!forceExpanded}
              />
              {(forceExpanded || !sub.is_collapsed) && (
                <div className="mt-1">
                  <TaskList section={sub} reorderable={!forceExpanded} />
                </div>
              )}
            </div>
          ))}

          {counts.completed > 0 && (
            <button
              onClick={onViewCompleted}
              className="ml-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {counts.completed} completed — view
            </button>
          )}
        </div>
      )}
    </div>
  );
}
