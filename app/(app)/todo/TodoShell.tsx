"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { SectionList } from "./SectionList";
import { PendingView } from "./PendingView";
import type { TodoSection } from "./types";

type Tab = "sections" | "pending";

export function TodoShell({
  sections,
  pendingCount,
}: {
  sections: TodoSection[];
  pendingCount: number;
}) {
  const [tab, setTab] = useState<Tab>("sections");

  return (
    <div className="space-y-4">
      <div className="flex rounded-xl border border-border bg-card p-1">
        <button
          onClick={() => setTab("sections")}
          className={cn(
            "flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            tab === "sections"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          By Section
        </button>
        <button
          onClick={() => setTab("pending")}
          className={cn(
            "flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            tab === "pending"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Pending
          {pendingCount > 0 && (
            <span className="ml-2 rounded-full bg-primary/20 px-2 py-0.5 text-xs">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {tab === "sections" ? (
        <SectionList sections={sections} />
      ) : (
        <PendingView sections={sections} />
      )}
    </div>
  );
}
