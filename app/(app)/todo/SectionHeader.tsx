"use client";

import { useState, useRef, useEffect } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Pencil,
  Trash2,
  Plus,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  setSectionCollapsed,
  updateSection,
  deleteSection,
  createSection,
  reorderSections,
} from "./actions";
import { useTodoStore } from "./store";
import * as tree from "./tree";
import type { TodoSection } from "./types";

export function SectionHeader({
  section,
  siblings,
  parentId,
  isSubsection,
  forceExpanded,
  reorderable,
}: {
  section: TodoSection;
  /** Sibling sections in render order, for reordering. */
  siblings: TodoSection[];
  parentId: string | null;
  isSubsection: boolean;
  /** Search results are always shown open, so hide the fold control. */
  forceExpanded: boolean;
  /** Off while filtering — neighbours may be hidden, so a move would look inert. */
  reorderable: boolean;
}) {
  const { run, patch } = useTodoStore();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(section.name);
  const [addingSub, setAddingSub] = useState(false);
  const [subName, setSubName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const subInputRef = useRef<HTMLInputElement>(null);

  const counts = tree.countTasks([section]);
  const total = counts.pending + counts.completed;

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (addingSub) subInputRef.current?.focus();
  }, [addingSub]);

  // Folding is pure UI state: flip it locally and let the write settle in the
  // background rather than making the user wait on a round trip.
  const handleToggle = () => {
    const isCollapsed = !section.is_collapsed;
    patch((sections) =>
      tree.mapSection(sections, section.id, (s) => ({
        ...s,
        is_collapsed: isCollapsed,
      }))
    );
    void setSectionCollapsed({ sectionId: section.id, isCollapsed });
  };

  const handleSaveEdit = () => {
    const name = editValue.trim();
    setEditing(false);
    if (!name || name === section.name) {
      setEditValue(section.name);
      return;
    }
    run(
      (sections) => tree.mapSection(sections, section.id, (s) => ({ ...s, name })),
      () => updateSection({ sectionId: section.id, name })
    );
  };

  const handleDelete = () => {
    const suffix = total > 0 ? ` and its ${total} task${total === 1 ? "" : "s"}` : "";
    if (!confirm(`Delete "${section.name}"${suffix}?`)) return;
    run(
      (sections) => tree.removeSection(sections, section.id),
      () => deleteSection(section.id)
    );
  };

  const handleAddSub = async () => {
    const name = subName.trim();
    if (!name) return;
    setSubName("");
    setAddingSub(false);

    const tempId = crypto.randomUUID();
    const optimistic: TodoSection = {
      id: tempId,
      parent_id: section.id,
      name,
      position: 0,
      is_collapsed: false,
      tasks: [],
      subsections: [],
    };

    const result = await run(
      (sections) => tree.addSection(sections, section.id, optimistic),
      () => createSection({ name, parentId: section.id })
    );

    if (result.ok) {
      const realId = result.data.id;
      patch((sections) =>
        tree.mapSection(sections, tempId, (s) => ({ ...s, id: realId }))
      );
    }
  };

  const handleMove = (direction: -1 | 1) => {
    const from = siblings.findIndex((s) => s.id === section.id);
    const to = from + direction;
    if (from === -1 || to < 0 || to >= siblings.length) return;
    const ordered = tree.moveItem(siblings, from, to);
    run(
      (sections) =>
        parentId === null
          ? ordered
          : tree.mapSection(sections, parentId, (s) => ({
              ...s,
              subsections: ordered,
            })),
      () => reorderSections({ orderedIds: ordered.map((s) => s.id) })
    );
  };

  const index = siblings.findIndex((s) => s.id === section.id);

  return (
    <div className="space-y-1">
      <div className="group flex min-h-[44px] items-center gap-2">
        {forceExpanded ? (
          <span className="h-7 w-7 shrink-0" aria-hidden />
        ) : (
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
        )}

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
            {total > 0 && (
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
                  counts.completed === total
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {counts.completed}/{total}
              </span>
            )}
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              {reorderable && (
                <>
                  <button
                    onClick={() => handleMove(-1)}
                    disabled={index <= 0}
                    className="flex h-8 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                    aria-label="Move section up"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleMove(1)}
                    disabled={index === -1 || index >= siblings.length - 1}
                    className="flex h-8 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                    aria-label="Move section down"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
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
          />
          <button
            onClick={handleAddSub}
            disabled={!subName.trim()}
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
