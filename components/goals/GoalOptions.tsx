"use client";

import { createContext, useContext, type ReactNode } from "react";
import { Target } from "lucide-react";
import { cn } from "@/lib/utils";

export type GoalOption = { id: string; title: string };

/**
 * The goals a piece of work can be linked to. Provided once at the top of a
 * page so deeply nested rows (todos) don't need it threaded through props.
 */
const GoalOptionsContext = createContext<GoalOption[]>([]);

export function GoalOptionsProvider({
  goals,
  children,
}: {
  goals: GoalOption[];
  children: ReactNode;
}) {
  return <GoalOptionsContext.Provider value={goals}>{children}</GoalOptionsContext.Provider>;
}

export function useGoalOptions() {
  return useContext(GoalOptionsContext);
}

/** "Helps a goal: [None / goal…]". Renders nothing when there are no goals to pick. */
export function GoalSelect({
  id,
  value,
  goals,
  onChange,
  disabled,
  className,
}: {
  id: string;
  value: string | null;
  goals: GoalOption[];
  onChange: (goalId: string | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  if (goals.length === 0) return null;
  return (
    <div className={cn("flex min-w-0 items-center gap-2 text-xs text-muted-foreground", className)}>
      <Target className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <label htmlFor={id} className="shrink-0">
        Helps a goal
      </label>
      <select
        id={id}
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 sm:max-w-xs sm:text-sm"
      >
        <option value="">None</option>
        {goals.map((g) => (
          <option key={g.id} value={g.id}>
            {g.title}
          </option>
        ))}
      </select>
    </div>
  );
}
