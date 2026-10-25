import type { ReactNode } from "react";
import { Dumbbell, HeartPulse, Target, Utensils, type LucideIcon } from "lucide-react";
import { DayFoodPanel } from "./DayFoodPanel";
import { TrainedToday } from "./TrainedToday";
import { WaterWeight } from "./WaterWeight";
import { GoalsCheck } from "./GoalsCheck";
import type { WrapupBodyData } from "./load";

function Part({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <div className="space-y-2 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </h3>
      {children}
    </div>
  );
}

/**
 * The day's body and goals, in the one sitting the wrap-up already is: food
 * typed once, a session tapped, water and weight, and the week's actions.
 */
export function BodyAndGoals({ date, data }: { date: string; data: WrapupBodyData }) {
  const showGoals = data.levers.length > 0 || data.endedGoals.length > 0;
  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-3 sm:p-4">
      <Part icon={Utensils} title="Food">
        <DayFoodPanel date={date} meals={data.meals} kcalGoal={data.kcalGoal} proteinGoal={data.proteinGoal} />
      </Part>
      <Part icon={Dumbbell} title="Training">
        <TrainedToday date={date} sessions={data.sessions} />
      </Part>
      <Part icon={HeartPulse} title="Water and weight">
        <WaterWeight
          date={date}
          waterMl={data.waterMl}
          waterGoalMl={data.waterGoalMl}
          volumeUnit={data.volumeUnit}
          weightKg={data.weightKg}
          weightUnit={data.weightUnit}
        />
      </Part>
      {showGoals && (
        <Part icon={Target} title="Goals">
          <GoalsCheck levers={data.levers} endedGoals={data.endedGoals} />
        </Part>
      )}
    </div>
  );
}
