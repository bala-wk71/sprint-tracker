"use client";

import { useMemo, useState } from "react";
import { Layers, CheckCheck, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionList } from "./SectionList";
import { CompletedView } from "./CompletedView";
import { TodoProvider, useTodoStore } from "./store";
import * as tree from "./tree";
import type { TodoSection } from "./types";

type Tab = "sections" | "completed";

const TABS: { id: Tab; label: string; icon: typeof Layers }[] = [
  { id: "sections", label: "Tasks", icon: Layers },
  { id: "completed", label: "Completed", icon: CheckCheck },
];

function TodoBody() {
  const { sections } = useTodoStore();
  const [tab, setTab] = useState<Tab>("sections");
  const [query, setQuery] = useState("");

  const searching = query.trim().length > 0;
  const visible = useMemo(() => tree.filterTree(sections, query), [sections, query]);
  const counts = useMemo(() => tree.countTasks(sections), [sections]);

  const total = counts.pending + counts.completed;
  const pct = total > 0 ? Math.round((counts.completed / total) * 100) : 0;

  const tabCounts: Record<Tab, number> = {
    sections: counts.pending,
    completed: counts.completed,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-border bg-card p-1">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            const count = tabCounts[id];
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                aria-pressed={active}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors sm:px-4",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
                {count > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs tabular-nums",
                      active ? "bg-primary-foreground/20" : "bg-muted"
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQuery("");
          }}
          placeholder="Search tasks, notes and sections…"
          aria-label="Search tasks"
          className="h-11 w-full rounded-lg border border-border bg-card pl-9 pr-10 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {searching && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {tab === "sections" ? (
        <SectionList
          sections={visible}
          allSections={sections}
          searching={searching}
          onViewCompleted={() => setTab("completed")}
        />
      ) : (
        <CompletedView sections={visible} searching={searching} />
      )}
    </div>
  );
}

export function TodoShell({ sections }: { sections: TodoSection[] }) {
  return (
    <TodoProvider initialSections={sections}>
      <TodoBody />
    </TodoProvider>
  );
}
