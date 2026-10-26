"use client";

import { createContext, useContext, type ReactNode } from "react";
import { Target } from "lucide-react";
import { cn } from "@/lib/utils";

/** `group` is the stream; options arrive already ordered by it. */
export type GoalOption = { id: string; title: string; group?: string | null };

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

/** Consecutive runs of the same group, keeping the incoming order. */
function groupsOf(goals: GoalOption[]) {
  const runs: { group: string | null; items: GoalOption[] }[] = [];
  for (const g of goals) {
    const group = g.group ?? null;
    const last = runs.at(-1);
    if (last && last.group === group) last.items.push(g);
    else runs.push({ group, items: [g] });
  }
  return runs;
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
        {groupsOf(goals).map(({ group, items }) =>
          group ? (
            <optgroup key={group} label={group}>
              {items.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </optgroup>
          ) : (
            items.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))
          )
        )}
      </select>
    </div>
  );
}

/** What a sprint task's goal field holds: a goal, "not for a goal", or not answered yet. */
export const NOT_FOR_A_GOAL = "none";

/**
 * "Serves: [goal / Not for a goal]". Every sprint task answers it, so the
 * week shows how its hours line up with the goals. An empty value means the
 * question hasn't been answered yet.
 */
export function TaskGoalSelect({
  id,
  value,
  goals,
  onChange,
  disabled,
  invalid,
  className,
}: {
  id: string;
  /** A goal id, NOT_FOR_A_GOAL, or "" when not answered. */
  value: string;
  goals: GoalOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}) {
  if (goals.length === 0) return null;
  return (
    <div className={cn("flex min-w-0 items-center gap-2 text-xs text-muted-foreground", className)}>
      <Target className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <label htmlFor={id} className="shrink-0">
        Serves
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 sm:max-w-xs sm:text-sm",
          invalid ? "border-destructive" : "border-input",
          value === "" && "text-muted-foreground"
        )}
      >
        <option value="" disabled>
          Which goal does this serve?
        </option>
        <option value={NOT_FOR_A_GOAL}>Not for a goal</option>
        {groupsOf(goals).map(({ group, items }) =>
          group ? (
            <optgroup key={group} label={group}>
              {items.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </optgroup>
          ) : (
            items.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))
          )
        )}
      </select>
    </div>
  );
}

/** A task's goal field value as the goal id to store. */
export function goalIdOf(value: string): string | null {
  return value && value !== NOT_FOR_A_GOAL ? value : null;
}
