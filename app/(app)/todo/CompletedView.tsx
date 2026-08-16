"use client";

import { useMemo, useState } from "react";
import { format, isToday, isYesterday, isThisWeek } from "date-fns";
import { Check, Undo2, Trash2, Inbox, SearchX } from "lucide-react";
import { cn } from "@/lib/utils";
import { toggleTaskComplete, deleteTask, clearCompletedTasks } from "./actions";
import { useTodoStore } from "./store";
import * as tree from "./tree";
import type { TodoSection, TodoTask } from "./types";

type DoneTask = TodoTask & { path: string };

type DoneGroup = {
  key: string;
  label: string;
  tasks: DoneTask[];
};

/** Flatten the section tree into completed tasks tagged with their breadcrumb. */
function collectCompleted(sections: TodoSection[], prefix = ""): DoneTask[] {
  const out: DoneTask[] = [];
  for (const section of sections) {
    const path = prefix ? `${prefix} › ${section.name}` : section.name;
    for (const task of section.tasks) {
      if (task.is_completed) out.push({ ...task, path });
    }
    out.push(...collectCompleted(section.subsections, path));
  }
  return out;
}

/**
 * Bucket by completion day. Ordering is by bucket rank so a task with no
 * completed_at (pre-dating that column) still lands in a sensible place.
 */
function bucketOf(task: DoneTask): { key: string; label: string; rank: number } {
  if (!task.completed_at) return { key: "unknown", label: "No date", rank: 4 };
  const date = new Date(task.completed_at);
  if (isToday(date)) return { key: "today", label: "Today", rank: 0 };
  if (isYesterday(date)) return { key: "yesterday", label: "Yesterday", rank: 1 };
  if (isThisWeek(date, { weekStartsOn: 1 }))
    return { key: "week", label: "Earlier this week", rank: 2 };
  return { key: "older", label: "Older", rank: 3 };
}

function groupCompleted(tasks: DoneTask[]): DoneGroup[] {
  const buckets = new Map<string, DoneGroup & { rank: number }>();
  for (const task of tasks) {
    const { key, label, rank } = bucketOf(task);
    const existing = buckets.get(key);
    if (existing) existing.tasks.push(task);
    else buckets.set(key, { key, label, rank, tasks: [task] });
  }
  const groups = [...buckets.values()].sort((a, b) => a.rank - b.rank);
  for (const group of groups) {
    // Newest first inside a day.
    group.tasks.sort(
      (a, b) =>
        new Date(b.completed_at ?? 0).getTime() -
        new Date(a.completed_at ?? 0).getTime()
    );
  }
  return groups;
}

function CompletedRow({ task }: { task: DoneTask }) {
  const { run, applyArchiveEffect } = useTodoStore();
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reopening a task inside an archived section pulls that section back out of
  // the archive server-side; mirror that here.
  const handleRestore = async () => {
    const result = await run(
      (sections) =>
        tree.updateTask(sections, task.id, (t) => ({
          ...t,
          is_completed: false,
          completed_at: null,
        })),
      () => toggleTaskComplete({ taskId: task.id, isCompleted: false })
    );
    if (result.ok) applyArchiveEffect(result.data);
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      window.setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    run(
      (sections) => tree.removeTask(sections, task.id),
      () => deleteTask(task.id)
    );
  };

  return (
    <div className="group flex min-h-[44px] items-center gap-3 rounded-md px-2 py-1 transition-colors hover:bg-accent/50">
      <button
        onClick={handleRestore}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-primary bg-primary text-primary-foreground transition-colors hover:border-muted-foreground/50 hover:bg-transparent hover:text-transparent"
        aria-label="Mark incomplete"
        title="Mark incomplete"
      >
        <Check className="h-3 w-3" />
      </button>

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm text-muted-foreground line-through">
          {task.title}
        </span>
        <span className="truncate text-[11px] text-muted-foreground/70">
          {task.path}
          {task.completed_at && (
            <> · {format(new Date(task.completed_at), "MMM d, HH:mm")}</>
          )}
        </span>
      </div>

      <div className="flex shrink-0 gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <button
          onClick={handleRestore}
          className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Restore task"
          title="Restore to its section"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleDelete}
          className={cn(
            "flex h-8 items-center justify-center gap-1 rounded px-2 text-[11px] font-medium transition-colors",
            confirmDelete
              ? "bg-destructive/10 text-destructive opacity-100"
              : "w-8 px-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          )}
          aria-label={confirmDelete ? "Confirm delete" : "Delete task"}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {confirmDelete && "Sure?"}
        </button>
      </div>
    </div>
  );
}

export function CompletedView({
  sections,
  searching,
}: {
  sections: TodoSection[];
  searching: boolean;
}) {
  const { run } = useTodoStore();
  const [confirmClear, setConfirmClear] = useState(false);

  const groups = useMemo(
    () => groupCompleted(collectCompleted(sections)),
    [sections]
  );
  const total = groups.reduce((sum, g) => sum + g.tasks.length, 0);

  const handleClear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      window.setTimeout(() => setConfirmClear(false), 4000);
      return;
    }
    setConfirmClear(false);
    run(
      (current) => tree.mapTasks(current, (tasks) => tasks.filter((t) => !t.is_completed)),
      () => clearCompletedTasks()
    );
  };

  if (total === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border py-16 text-center">
        {searching ? (
          <>
            <SearchX className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">No matches</p>
            <p className="mt-1 text-xs text-muted-foreground">
              No completed task matches that search.
            </p>
          </>
        ) : (
          <>
            <Inbox className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">
              Nothing completed yet
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Tasks you tick off move here, grouped by the day you finished them.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{total}</span>{" "}
          {searching ? "matching" : "completed"}
          {total === 1 ? " task" : " tasks"}
        </p>
        {/* Clearing always removes every completed task, so it stays out of the
            way while a search is narrowing the list. */}
        {!searching && (
          <button
            onClick={handleClear}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
              confirmClear
                ? "border-destructive/50 bg-destructive/10 text-destructive"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {confirmClear
              ? `Delete all ${total}? Click to confirm`
              : "Clear completed"}
          </button>
        )}
      </div>

      {groups.map((group) => (
        <div key={group.key} className="rounded-xl border border-border bg-card p-3 sm:p-4">
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
              <CompletedRow key={task.id} task={task} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
