import Link from "next/link";
import { format } from "date-fns";
import { Lock, Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import { goalArea, horizonLabel } from "@/lib/goals/constants";
import { isCheckinDue, isPastEnd, nextCheckinLabel, timeLeftLabel } from "@/lib/goals/progress";
import { GoalProgressBar } from "./GoalProgressBar";
import { GoalStatusChip } from "./GoalStatusChip";

export type GoalRowData = {
  id: string;
  title: string;
  area: string;
  horizon: string;
  start_date: string;
  target_date: string;
  track_type: string;
  start_value: number | null;
  target_value: number | null;
  current_value: number | null;
  unit: string | null;
  status: string;
  pinned: boolean;
  is_private: boolean;
  checkin_every_days: number;
  last_checkin_on: string | null;
  completed_at: string | null;
};

type Props = {
  goal: GoalRowData;
  stepsDone: number;
  stepsTotal: number;
  feelings: number[];
  parentTitle: string | null;
  todayIso: string;
};

export function GoalRow({ goal, stepsDone, stepsTotal, feelings, parentTitle, todayIso }: Props) {
  const area = goalArea(goal.area);
  const closed = goal.status === "done" || goal.status === "let_go";
  const due = isCheckinDue(goal, todayIso);
  const pastEnd = isPastEnd(goal, todayIso);

  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", area.dot)} aria-hidden />
          <Link
            href={`/goals/${goal.id}`}
            className="min-w-0 truncate font-medium text-foreground hover:text-primary"
          >
            {goal.title}
          </Link>
          {goal.pinned && <Pin className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Pinned" />}
          {goal.is_private && (
            <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Only you can see this" />
          )}
        </div>
        <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span>{area.label}</span>
          <span>{horizonLabel(goal.horizon, goal.start_date, goal.target_date)}</span>
          <span>
            {closed && goal.completed_at
              ? `Closed ${format(new Date(goal.completed_at), "d MMM yyyy")}`
              : timeLeftLabel(goal.target_date, todayIso)}
          </span>
          {parentTitle && <span className="min-w-0 truncate">Part of “{parentTitle}”</span>}
        </p>
        {!closed && (
          <GoalProgressBar
            trackType={goal.track_type}
            startValue={goal.start_value}
            targetValue={goal.target_value}
            currentValue={goal.current_value}
            unit={goal.unit}
            stepsDone={stepsDone}
            stepsTotal={stepsTotal}
            feelings={feelings}
          />
        )}
      </div>

      <div className="shrink-0 text-xs">
        {closed || goal.status === "paused" ? (
          <GoalStatusChip status={goal.status} />
        ) : pastEnd ? (
          <Link
            href={`/goals/${goal.id}`}
            className="rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-700 dark:text-amber-300"
          >
            Past end date
          </Link>
        ) : due ? (
          <Link
            href={`/goals/${goal.id}#check-in`}
            className="inline-block rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:bg-primary/90"
          >
            Check in
          </Link>
        ) : (
          <span className="text-muted-foreground">{nextCheckinLabel(goal, todayIso)}</span>
        )}
      </div>
    </li>
  );
}
