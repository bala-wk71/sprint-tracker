"use client";

import { useState } from "react";
import { Layers, CircleDashed, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionList } from "./SectionList";
import { PendingView } from "./PendingView";
import { CompletedView } from "./CompletedView";
import type { TodoSection } from "./types";

type Tab = "sections" | "pending" | "completed";

const TABS: { id: Tab; label: string; icon: typeof Layers }[] = [
  { id: "sections", label: "Sections", icon: Layers },
  { id: "pending", label: "Pending", icon: CircleDashed },
  { id: "completed", label: "Completed", icon: CheckCheck },
];

export function TodoShell({
  sections,
  pendingCount,
  completedCount,
}: {
  sections: TodoSection[];
  pendingCount: number;
  completedCount: number;
}) {
  const [tab, setTab] = useState<Tab>("sections");
  const total = pendingCount + completedCount;
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  const counts: Record<Tab, number> = {
    sections: 0,
    pending: pendingCount,
    completed: completedCount,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-border bg-card p-1">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            const count = counts[id];
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

        {total > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              <span className="font-semibold text-foreground">{completedCount}</span>{" "}
              of {total} done
            </span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="tabular-nums">{pct}%</span>
          </div>
        )}
      </div>

      {tab === "sections" && (
        <SectionList
          sections={sections}
          onViewCompleted={() => setTab("completed")}
        />
      )}
      {tab === "pending" && <PendingView sections={sections} />}
      {tab === "completed" && <CompletedView sections={sections} />}
    </div>
  );
}
