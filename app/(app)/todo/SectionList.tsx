"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, FolderPlus } from "lucide-react";
import { createSection } from "./actions";
import { SectionCard } from "./SectionCard";
import type { TodoSection } from "./types";

export function SectionList({
  sections,
  showCompleted,
}: {
  sections: TodoSection[];
  showCompleted: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    startTransition(async () => {
      await createSection({ name: trimmed });
      setName("");
      setAdding(false);
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {sections.length === 0 && !adding && (
        <div className="rounded-xl border border-dashed border-border py-12 text-center">
          <FolderPlus className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No sections yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create a section below to start organising tasks.
          </p>
        </div>
      )}

      {sections.map((section) => (
        <SectionCard
          key={section.id}
          section={section}
          showCompleted={showCompleted}
        />
      ))}

      {adding ? (
        <div className="flex gap-2">
          <input
            ref={inputRef}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
              if (e.key === "Escape") {
                setName("");
                setAdding(false);
              }
            }}
            placeholder="Section name…"
            className="h-11 flex-1 rounded-md border border-border bg-background px-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={isPending}
          />
          <button
            onClick={handleAdd}
            disabled={isPending || !name.trim()}
            className="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Add
          </button>
          <button
            onClick={() => {
              setName("");
              setAdding(false);
            }}
            className="h-11 rounded-md border border-border px-3 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex h-11 w-full items-center gap-2 rounded-lg border border-dashed border-border px-4 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          Add section
        </button>
      )}
    </div>
  );
}
