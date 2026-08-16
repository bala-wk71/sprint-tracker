"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Pencil,
  Trash2,
  Check,
  X,
  ChevronUp,
  ChevronDown,
  NotebookPen,
  StickyNote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  toggleTaskComplete,
  updateTask as updateTaskAction,
  deleteTask,
  reorderTasks,
} from "./actions";
import { useTodoStore } from "./store";
import * as tree from "./tree";
import { RowActions } from "./RowActions";
import { TaskNotes } from "./TaskNotes";
import type { TodoTask } from "./types";

export function TaskItem({
  task,
  sectionId,
  siblings,
}: {
  task: TodoTask;
  /** Section the task lives in — needed to rewrite sibling order. */
  sectionId?: string;
  /** The section's full task list, in position order. Omit to hide reordering. */
  siblings?: TodoTask[];
}) {
  const { run, applyArchiveEffect } = useTodoStore();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(task.title);
  const [notesOpen, setNotesOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const handleToggle = async () => {
    const isCompleted = !task.is_completed;
    const result = await run(
      (sections) =>
        tree.updateTask(sections, task.id, (t) => ({
          ...t,
          is_completed: isCompleted,
          completed_at: isCompleted ? new Date().toISOString() : null,
        })),
      () => toggleTaskComplete({ taskId: task.id, isCompleted })
    );
    if (!result.ok) return;

    // Finishing the last item in a note section retires it; the store says so
    // and offers the way back, so the section never just vanishes.
    applyArchiveEffect(result.data);
  };

  const handleSaveEdit = () => {
    const title = editValue.trim();
    setEditing(false);
    if (!title || title === task.title) {
      setEditValue(task.title);
      return;
    }
    run(
      (sections) => tree.updateTask(sections, task.id, (t) => ({ ...t, title })),
      () => updateTaskAction({ taskId: task.id, title })
    );
  };

  const handleSaveNotes = (description: string) => {
    run(
      (sections) =>
        tree.updateTask(sections, task.id, (t) => ({
          ...t,
          description: description || null,
        })),
      () => updateTaskAction({ taskId: task.id, description })
    );
  };

  // Two-step delete: there is no undo, so a stray click shouldn't destroy a task.
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

  const handleMove = (direction: -1 | 1) => {
    if (!siblings || !sectionId) return;
    const reordered = tree.moveTaskInList(siblings, task.id, direction);
    if (!reordered) return;
    run(
      (sections) =>
        tree.mapSection(sections, sectionId, (s) => ({ ...s, tasks: reordered })),
      () => reorderTasks({ orderedIds: reordered.map((t) => t.id) })
    );
  };

  const canReorder = Boolean(siblings && sectionId);
  const canMoveUp = canReorder && tree.canMoveTask(siblings!, task.id, -1);
  const canMoveDown = canReorder && tree.canMoveTask(siblings!, task.id, 1);
  const hasNotes = Boolean(task.description?.trim());
  // UTC on both sides of the render, so this cannot desync during hydration.
  const overdue =
    !task.is_completed &&
    task.due_date !== null &&
    task.due_date < new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-md transition-colors hover:bg-accent/50">
      <div className="group flex min-h-[44px] flex-wrap items-center gap-3 px-2 py-1">
        <button
          onClick={handleToggle}
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
            task.is_completed
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/50 hover:border-primary"
          )}
          aria-label={task.is_completed ? "Mark incomplete" : "Mark complete"}
        >
          {task.is_completed && <Check className="h-3 w-3" />}
        </button>

        {editing ? (
          <div className="flex flex-1 gap-2">
            <input
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveEdit();
                if (e.key === "Escape") {
                  setEditing(false);
                  setEditValue(task.title);
                }
              }}
              className="h-9 flex-1 rounded border border-border bg-background px-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={handleSaveEdit}
              className="flex h-9 w-9 items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setEditValue(task.title);
              }}
              className="flex h-9 w-9 items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => setNotesOpen((o) => !o)}
              onDoubleClick={() => setEditing(true)}
              title={hasNotes ? "Show notes" : "Double-click to rename"}
              className={cn(
                "min-w-0 flex-1 truncate text-left text-sm",
                task.is_completed
                  ? "text-muted-foreground line-through"
                  : "text-foreground"
              )}
            >
              {task.title}
            </button>

            {task.due_date && (
              <span
                className={cn(
                  "shrink-0 text-xs tabular-nums",
                  overdue ? "text-destructive" : "text-muted-foreground"
                )}
              >
                {task.due_date}
              </span>
            )}

            {task.source_page_id && (
              <Link
                href={`/notes/${task.source_page_id}`}
                title={`From ${task.source_page_title ?? "a note page"}`}
                className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <NotebookPen className="h-3.5 w-3.5" />
                <span className="hidden max-w-[10rem] truncate sm:inline">
                  {task.source_page_title ?? "Note"}
                </span>
              </Link>
            )}

            {hasNotes && !notesOpen && (
              <StickyNote
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70"
                aria-label="Has notes"
              />
            )}

            <RowActions label="task actions">
              {canReorder && (
                <>
                  <button
                    onClick={() => handleMove(-1)}
                    disabled={!canMoveUp}
                    className="flex h-8 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                    aria-label="Move task up"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleMove(1)}
                    disabled={!canMoveDown}
                    className="flex h-8 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                    aria-label="Move task down"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
              <button
                onClick={() => setNotesOpen((o) => !o)}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded hover:bg-accent hover:text-foreground",
                  notesOpen ? "text-foreground" : "text-muted-foreground"
                )}
                aria-label={hasNotes ? "Edit notes" : "Add notes"}
              >
                <StickyNote className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setEditing(true)}
                className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Rename task"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={handleDelete}
                className={cn(
                  "flex h-8 items-center justify-center gap-1 rounded text-[11px] font-medium transition-colors",
                  confirmDelete
                    ? "bg-destructive/10 px-2 text-destructive opacity-100"
                    : "w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                )}
                aria-label={confirmDelete ? "Confirm delete" : "Delete task"}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {confirmDelete && "Sure?"}
              </button>
            </RowActions>
          </>
        )}
      </div>

      {notesOpen && (
        <TaskNotes
          value={task.description ?? ""}
          onSave={handleSaveNotes}
          onClose={() => setNotesOpen(false)}
        />
      )}
    </div>
  );
}
