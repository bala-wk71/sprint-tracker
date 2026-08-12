"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  Plus,
  Check,
  CheckCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  toggleSectionCollapse,
  updateSection,
  deleteSection,
  createSection,
} from "./actions";
import { TaskItem } from "./TaskItem";
import { TaskInput } from "./TaskInput";
import type { TodoSection } from "./types";

/** Done/total across a section's own tasks and all its subsections. */
function countSection(section: TodoSection): { done: number; total: number } {
  let done = section.tasks.filter((t) => t.is_completed).length;
  let total = section.tasks.length;
  for (const sub of section.subsections) {
    const c = countSection(sub);
    done += c.done;
    total += c.total;
  }
  return { done, total };
}

function SectionHeader({
  section,
  isSubsection,
}: {
  section: TodoSection;
  isSubsection: boolean;
}) {
  const counts = countSection(section);
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(section.name);
  const [addingSub, setAddingSub] = useState(false);
  const [subName, setSubName] = useState("");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const subInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (addingSub) subInputRef.current?.focus();
  }, [addingSub]);

  const handleToggle = () => {
    startTransition(async () => {
      await toggleSectionCollapse(section.id);
      router.refresh();
    });
  };

  const handleSaveEdit = () => {
    const name = editValue.trim();
    if (!name || name === section.name) {
      setEditing(false);
      setEditValue(section.name);
      return;
    }
    startTransition(async () => {
      await updateSection({ sectionId: section.id, name });
      setEditing(false);
      router.refresh();
    });
  };

  const handleDelete = () => {
    if (!confirm(`Delete section "${section.name}" and all its tasks?`)) return;
    startTransition(async () => {
      await deleteSection(section.id);
      router.refresh();
    });
  };

  const handleAddSub = () => {
    const name = subName.trim();
    if (!name) return;
    startTransition(async () => {
      await createSection({ name, parentId: section.id });
      setSubName("");
      setAddingSub(false);
      router.refresh();
    });
  };

  return (
    <div className={cn("space-y-1", isPending && "opacity-50")}>
      <div className="group flex min-h-[44px] items-center gap-2">
        <button
          onClick={handleToggle}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          aria-label={section.is_collapsed ? "Expand" : "Collapse"}
        >
          {section.is_collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
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
                  setEditValue(section.name);
                }
              }}
              className="h-9 flex-1 rounded border border-border bg-background px-2 text-base font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
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
                setEditValue(section.name);
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
                "flex-1 font-semibold text-foreground",
                isSubsection ? "text-sm" : "text-base"
              )}
            >
              {section.name}
            </span>
            {counts.total > 0 && (
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
                  counts.done === counts.total
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {counts.done}/{counts.total}
              </span>
            )}
            <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100">
              {!isSubsection && (
                <button
                  onClick={() => setAddingSub(true)}
                  className="flex h-8 items-center gap-1 rounded px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                  title="Add subsection"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Sub
                </button>
              )}
              <button
                onClick={() => setEditing(true)}
                className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Rename section"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label="Delete section"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </>
        )}
      </div>

      {addingSub && (
        <div className="ml-9 flex gap-2">
          <input
            ref={subInputRef}
            value={subName}
            onChange={(e) => setSubName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddSub();
              if (e.key === "Escape") {
                setSubName("");
                setAddingSub(false);
              }
            }}
            placeholder="Subsection name…"
            className="h-11 flex-1 rounded-md border border-border bg-background px-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={isPending}
          />
          <button
            onClick={handleAddSub}
            disabled={isPending || !subName.trim()}
            className="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Add
          </button>
          <button
            onClick={() => {
              setSubName("");
              setAddingSub(false);
            }}
            className="h-11 rounded-md border border-border px-3 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

/** Only open tasks live here now — completed ones belong to the Completed tab. */
function TaskList({ section }: { section: TodoSection }) {
  const pendingTasks = section.tasks.filter((t) => !t.is_completed);

  return (
    <div className="space-y-0.5">
      {pendingTasks.map((task) => (
        <TaskItem key={task.id} task={task} />
      ))}
      <TaskInput sectionId={section.id} />
    </div>
  );
}

export function SectionCard({
  section,
  onViewCompleted,
}: {
  section: TodoSection;
  onViewCompleted?: () => void;
}) {
  const counts = countSection(section);

  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <SectionHeader section={section} isSubsection={false} />

      {counts.total > 0 && (
        <div className="ml-9 mt-1 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(counts.done / counts.total) * 100}%` }}
          />
        </div>
      )}

      {!section.is_collapsed && (
        <div className="mt-2 space-y-4">
          <TaskList section={section} />

          {section.subsections.map((sub) => (
            <div key={sub.id} className="ml-2 border-l border-border pl-3">
              <SectionHeader section={sub} isSubsection={true} />
              {!sub.is_collapsed && (
                <div className="mt-1">
                  <TaskList section={sub} />
                </div>
              )}
            </div>
          ))}

          {counts.done > 0 && (
            <button
              onClick={onViewCompleted}
              className="ml-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {counts.done} completed — view
            </button>
          )}
        </div>
      )}
    </div>
  );
}
