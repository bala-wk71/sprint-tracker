import { Target } from "lucide-react";
import type { TaskCategory } from "@/lib/constants";
import { CategoryBadge } from "@/components/sprint/CategoryBadge";

export type FocusTask = {
  id: string;
  name: string;
  category: TaskCategory;
  behindHours: number;
  targetHours: number;
  actualHours: number;
};

/** Sprint tasks most behind their weekly pace — candidates for today. */
export function FocusToday({ tasks }: { tasks: FocusTask[] }) {
  if (tasks.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="mb-2 flex items-center gap-2">
        <Target className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Focus today</h2>
        <span className="text-xs text-muted-foreground">
          — these sprint tasks are behind pace
        </span>
      </div>
      <ul className="divide-y divide-border">
        {tasks.map((task) => (
          <li
            key={task.id}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium text-foreground">
                {task.name}
              </span>
              <CategoryBadge category={task.category} />
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs">
              <span className="text-muted-foreground">
                {Number(task.actualHours.toFixed(1))}h of {task.targetHours}h
              </span>
              <span className="rounded-full bg-[hsl(var(--strong-noise))]/10 px-2 py-0.5 font-medium text-[hsl(var(--strong-noise))]">
                {task.behindHours.toFixed(1)}h behind
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
