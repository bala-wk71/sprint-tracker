"use client";

import { useState } from "react";
import { Layers, CircleDashed, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionList } from "./SectionList";
import { PendingView } from "./PendingView";
import type { TodoSection } from "./types";

type Tab = "sections" | "pending";

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
  const [showCompleted, setShowCompleted] = useState(false);
  const total = pendingCount + completedCount;
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-border bg-card p-1">
          <button
            onClick={() => setTab("sections")}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
              tab === "sections"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Layers className="h-4 w-4" />
            Sections
          </button>
          <button
            onClick={() => setTab("pending")}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
              tab === "pending"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <CircleDashed className="h-4 w-4" />
            Pending
            {pendingCount > 0 && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs",
                  tab === "pending" ? "bg-primary-foreground/20" : "bg-muted"
                )}
              >
                {pendingCount}
              </span>
            )}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
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
          {completedCount > 0 && tab === "sections" && (
            <button
              onClick={() => setShowCompleted((s) => !s)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {showCompleted ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
              {showCompleted ? "Hide completed" : "Show completed"}
            </button>
          )}
        </div>
      </div>

      {tab === "sections" ? (
        <SectionList sections={sections} showCompleted={showCompleted} />
      ) : (
        <PendingView sections={sections} />
      )}
    </div>
  );
}
