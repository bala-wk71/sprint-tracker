import { cn } from "@/lib/utils";
import { GOAL_STATUSES } from "@/lib/goals/constants";

const STYLES: Record<string, string> = {
  active: "bg-primary/10 text-primary",
  paused: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  done: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  let_go: "bg-muted text-muted-foreground",
};

export function GoalStatusChip({ status, className }: { status: string; className?: string }) {
  const label = GOAL_STATUSES.find((s) => s.value === status)?.label ?? status;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        STYLES[status] ?? STYLES.let_go,
        className
      )}
    >
      {label}
    </span>
  );
}
