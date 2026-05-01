"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toggleTaskComplete, updateTask, deleteTask } from "./actions";
import type { TodoTask } from "./types";

export function TaskItem({ task }: { task: TodoTask }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(task.title);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const handleToggle = () => {
    startTransition(async () => {
      await toggleTaskComplete({ taskId: task.id, isCompleted: !task.is_completed });
      router.refresh();
    });
  };

  const handleSaveEdit = () => {
    const title = editValue.trim();
    if (!title || title === task.title) {
      setEditing(false);
      setEditValue(task.title);
      return;
    }
    startTransition(async () => {
      await updateTask({ taskId: task.id, title });
      setEditing(false);
      router.refresh();
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      await deleteTask(task.id);
      router.refresh();
    });
  };

  return (
    <div
      className={cn(
        "group flex min-h-[44px] items-center gap-3 rounded-md px-2 py-1 transition-colors hover:bg-accent/50",
        isPending && "opacity-50"
      )}
    >
      <button
        onClick={handleToggle}
        disabled={isPending}
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
            disabled={isPending}
          />
          <button
            onClick={handleSaveEdit}
            disabled={isPending}
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
          <span
            className={cn(
              "flex-1 text-sm",
              task.is_completed
                ? "text-muted-foreground line-through"
                : "text-foreground"
            )}
          >
            {task.title}
          </span>
          <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100">
            <button
              onClick={() => setEditing(true)}
              className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Edit task"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label="Delete task"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
