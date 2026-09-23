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
  ShieldCheck,
  StickyNote,
  Target,
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
import { GoalChip } from "@/components/goals/GoalChip";
import { GoalSelect, useGoalOptions } from "@/components/goals/GoalOptions";
import { RigorPanel } from "@/components/craft/RigorPanel";
import { CHECKLIST, CHECKLIST_TOTAL, tickedCount, type Ticks } from "@/lib/craft/checklist";
import { attachRigor } from "./rigor";

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
  const { run, applyArchiveEffect, notify, patch } = useTodoStore();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(task.title);
  const [notesOpen, setNotesOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [rigorOpen, setRigorOpen] = useState(false);
  // Held locally so the row chip and the open panel move together; the server
  // copy is authoritative and replaces this on every tick.
  const [rigor, setRigor] = useState(task.rigor ?? null);
  const goals = useGoalOptions();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const handleToggle = async () => {
    const isCompleted = !task.is_completed;

    // A task carrying an unfinished checklist cannot be ticked from the row.
    // This is the whole point of attaching one, so the row sends you to the
    // checklist rather than quietly letting you past it.
    if (isCompleted && rigor && !rigor.completed_at) {
      setRigorOpen(true);
      notify({
        message: `${CHECKLIST_TOTAL - tickedCount(rigor.ticks)} boxes left before this one is done.`,
      });
      return;
    }

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

  const handleSetGoal = (goalId: string | null) => {
    setGoalOpen(false);
    run(
      (sections) =>
        tree.updateTask(sections, task.id, (t) => ({
          ...t,
          goal_id: goalId,
          goal_title: goals.find((g) => g.id === goalId)?.title ?? null,
        })),
      () => updateTaskAction({ taskId: task.id, goalId })
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

  const handleAttachRigor = async () => {
    setRigorOpen(true);
    const result = await attachRigor({ taskId: task.id });
    if (!result.ok) {
      notify({ message: result.error });
      setRigorOpen(false);
      return;
    }
    setRigor({ ticks: result.data.ticks, completed_at: null });
  };

  /** The checklist closed the task for us; mirror that into the tree. */
  const handleRigorCompleted = () => {
    setRigorOpen(false);
    setRigor((prev) =>
      prev ? { ...prev, completed_at: new Date().toISOString() } : prev
    );
    patch((sections) =>
      tree.updateTask(sections, task.id, (t) => ({
        ...t,
        is_completed: true,
        completed_at: new Date().toISOString(),
      }))
    );
  };

  const rigorDone = rigor ? tickedCount(rigor.ticks) : 0;
  // The stage you are actually on, for the row chip — knowing it is "read the
  // diff" time at a glance is most of the value of showing anything here.
  const rigorStage = rigor
    ? CHECKLIST.find((stage) => stage.items.some((i) => !rigor.ticks[i.id]))?.title ?? null
    : null;

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

            {task.goal_id && task.goal_title && (
              <GoalChip goalId={task.goal_id} title={task.goal_title} />
            )}

            {rigor && !rigor.completed_at && (
              <button
                onClick={() => setRigorOpen((o) => !o)}
                title={rigorStage ? `Rigor — now: ${rigorStage}` : "Rigor"}
                className="flex shrink-0 items-center gap-1 rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                <span className="tabular-nums">
                  {rigorDone}/{CHECKLIST_TOTAL}
                </span>
                {rigorStage && (
                  <span className="hidden max-w-[11rem] truncate md:inline">
                    · {rigorStage}
                  </span>
                )}
              </button>
            )}

            {rigor?.completed_at && (
              <ShieldCheck
                className="h-3.5 w-3.5 shrink-0 text-primary"
                aria-label="Completed with the full checklist"
              />
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
              {goals.length > 0 && (
                <button
                  onClick={() => setGoalOpen((o) => !o)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded hover:bg-accent hover:text-foreground",
                    goalOpen || task.goal_id ? "text-foreground" : "text-muted-foreground"
                  )}
                  aria-label={task.goal_id ? "Change linked goal" : "Link to a goal"}
                >
                  <Target className="h-3.5 w-3.5" />
                </button>
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
              {!task.is_completed && (
                <button
                  onClick={rigor ? () => setRigorOpen((o) => !o) : handleAttachRigor}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded hover:bg-accent hover:text-foreground",
                    rigorOpen || rigor ? "text-foreground" : "text-muted-foreground"
                  )}
                  aria-label={rigor ? "Show rigor checklist" : "Work this one with rigor"}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                </button>
              )}
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

      {goalOpen && (
        <div className="px-10 pb-2">
          <GoalSelect
            id={`todo_goal_${task.id}`}
            value={task.goal_id ?? null}
            goals={goals}
            onChange={handleSetGoal}
          />
        </div>
      )}

      {notesOpen && (
        <TaskNotes
          value={task.description ?? ""}
          onSave={handleSaveNotes}
          onClose={() => setNotesOpen(false)}
        />
      )}

      {rigorOpen && rigor && !rigor.completed_at && (
        <RigorPanel
          taskId={task.id}
          ticks={rigor.ticks}
          onTicks={(ticks: Ticks) => setRigor((prev) => (prev ? { ...prev, ticks } : prev))}
          onCompleted={handleRigorCompleted}
          onDetached={() => {
            setRigor(null);
            setRigorOpen(false);
          }}
        />
      )}
    </div>
  );
}
