"use client";

import { useState, useRef } from "react";
import { Plus } from "lucide-react";
import { createTask } from "./actions";
import { useTodoStore } from "./store";
import * as tree from "./tree";
import type { TodoTask } from "./types";

export function TaskInput({ sectionId }: { sectionId: string }) {
  const { run, patch } = useTodoStore();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Stay open and focused after each add so a list can be typed in one go —
  // Escape or Cancel is the way out.
  const submit = async () => {
    const title = value.trim();
    if (!title) return;
    setValue("");

    const tempId = crypto.randomUUID();
    const optimistic: TodoTask = {
      id: tempId,
      section_id: sectionId,
      title,
      description: null,
      is_completed: false,
      completed_at: null,
      // Render order comes from array position; this is only a placeholder
      // until the server's real row arrives.
      position: 0,
      due_date: null,
      source_page_id: null,
      source_page_title: null,
    };

    const result = await run(
      (sections) => tree.addTask(sections, sectionId, optimistic),
      () => createTask({ sectionId, title })
    );

    if (result.ok) {
      const realId = result.data.id;
      patch((sections) =>
        tree.updateTask(sections, tempId, (t) => ({ ...t, id: realId }))
      );
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
        Add task
      </button>
    );
  }

  return (
    <div className="flex gap-2">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") {
            setValue("");
            setOpen(false);
          }
        }}
        placeholder="Task title… (Enter to add, Esc to close)"
        className="h-11 flex-1 rounded-md border border-border bg-background px-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <button
        onClick={submit}
        disabled={!value.trim()}
        className="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        Add
      </button>
      <button
        onClick={() => {
          setValue("");
          setOpen(false);
        }}
        className="h-11 rounded-md border border-border px-3 text-sm text-muted-foreground hover:text-foreground"
      >
        Cancel
      </button>
    </div>
  );
}
