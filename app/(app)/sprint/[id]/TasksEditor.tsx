"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { TASK_CATEGORIES, type TaskCategory } from "@/lib/constants";
import { CategoryBadge } from "@/components/sprint/CategoryBadge";
import { addTaskToSprint, deleteTask, updateTask } from "./actions";

export type EditableTask = {
  id: string;
  name: string;
  category: TaskCategory;
  target_hours: number;
  is_recurring: boolean;
};

export function TasksEditor({
  sprintId,
  initialTasks,
}: {
  sprintId: string;
  initialTasks: EditableTask[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditableTask | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTask, setNewTask] = useState<Omit<EditableTask, "id">>({
    name: "",
    category: "strong_signal",
    target_hours: 0,
    is_recurring: false,
  });
  const [error, setError] = useState<string | null>(null);

  const beginEdit = (task: EditableTask) => {
    setEditingId(task.id);
    setDraft({ ...task });
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
    setError(null);
  };

  const saveEdit = () => {
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      const result = await updateTask({
        taskId: draft.id,
        name: draft.name,
        category: draft.category,
        target_hours: draft.target_hours,
        is_recurring: draft.is_recurring,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      cancelEdit();
      router.refresh();
    });
  };

  const removeTask = (taskId: string) => {
    if (!confirm("Delete this task? Logged time on it will be unlinked but kept.")) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deleteTask(taskId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const submitNewTask = () => {
    if (!newTask.name.trim()) {
      setError("Task name is required");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addTaskToSprint({
        sprintId,
        ...newTask,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNewTask({
        name: "",
        category: "strong_signal",
        target_hours: 0,
        is_recurring: false,
      });
      setAdding(false);
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {initialTasks.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground">
          No tasks yet. Add one below.
        </p>
      )}

      {initialTasks.map((task) =>
        editingId === task.id && draft ? (
          <div
            key={task.id}
            className="grid gap-2 rounded-md border border-primary/40 bg-background p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1.2fr_0.8fr_auto_auto_auto]"
          >
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <select
              value={draft.category}
              onChange={(e) =>
                setDraft({ ...draft, category: e.target.value as TaskCategory })
              }
              className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {(Object.entries(TASK_CATEGORIES) as [TaskCategory, typeof TASK_CATEGORIES[TaskCategory]][]).map(
                ([value, meta]) => (
                  <option key={value} value={value}>
                    {meta.label}
                  </option>
                )
              )}
            </select>
            <input
              type="number"
              step="0.5"
              min="0"
              value={draft.target_hours}
              onChange={(e) =>
                setDraft({ ...draft, target_hours: Number(e.target.value) })
              }
              className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <label className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={draft.is_recurring}
                onChange={(e) =>
                  setDraft({ ...draft, is_recurring: e.target.checked })
                }
                className="h-4 w-4 rounded border-input"
              />
              Recurring
            </label>
            <button
              type="button"
              onClick={saveEdit}
              disabled={pending}
              className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={pending}
              className="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div
            key={task.id}
            className="flex items-center justify-between rounded-md border border-border bg-background p-3"
          >
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-foreground">{task.name}</span>
              <CategoryBadge category={task.category} />
              <span className="text-xs text-muted-foreground">
                {task.target_hours}h target
              </span>
              {task.is_recurring && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  Recurring
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => beginEdit(task)}
                className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => removeTask(task.id)}
                disabled={pending}
                className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        )
      )}

      {adding ? (
        <div className="grid gap-2 rounded-md border border-primary/40 bg-background p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1.2fr_0.8fr_auto_auto_auto]">
          <input
            type="text"
            placeholder="Task name"
            value={newTask.name}
            onChange={(e) => setNewTask({ ...newTask, name: e.target.value })}
            autoFocus
            className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <select
            value={newTask.category}
            onChange={(e) =>
              setNewTask({ ...newTask, category: e.target.value as TaskCategory })
            }
            className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {(Object.entries(TASK_CATEGORIES) as [TaskCategory, typeof TASK_CATEGORIES[TaskCategory]][]).map(
              ([value, meta]) => (
                <option key={value} value={value}>
                  {meta.emoji} {meta.label}
                </option>
              )
            )}
          </select>
          <input
            type="number"
            step="0.5"
            min="0"
            value={newTask.target_hours}
            onChange={(e) =>
              setNewTask({ ...newTask, target_hours: Number(e.target.value) })
            }
            className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <label className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={newTask.is_recurring}
              onChange={(e) =>
                setNewTask({ ...newTask, is_recurring: e.target.checked })
              }
              className="h-4 w-4 rounded border-input"
            />
            Recurring
          </label>
          <button
            type="button"
            onClick={submitNewTask}
            disabled={pending}
            className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setError(null);
            }}
            disabled={pending}
            className="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-accent"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary"
        >
          <Plus className="h-3 w-3" />
          Add task
        </button>
      )}

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
