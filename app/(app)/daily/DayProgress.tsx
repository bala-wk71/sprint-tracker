import { Check, Moon, Sunrise, Timer, type LucideIcon } from "lucide-react";

export type DaySteps = {
  checkin: boolean;
  timeLogged: boolean;
  wrapup: boolean;
};

const STEPS: Array<{
  key: keyof DaySteps;
  label: string;
  icon: LucideIcon;
  href: string;
  xp: number;
}> = [
  { key: "checkin", label: "Morning check-in", icon: Sunrise, href: "#morning", xp: 10 },
  { key: "timeLogged", label: "Log time", icon: Timer, href: "#time", xp: 5 },
  { key: "wrapup", label: "Evening wrap-up", icon: Moon, href: "#evening", xp: 15 },
];

type Props = {
  steps: DaySteps;
  hoursLogged: number;
  isToday: boolean;
};

export function DayProgress({ steps, hoursLogged, isToday }: Props) {
  const done = STEPS.filter((s) => steps[s.key]).length;
  const allDone = done === STEPS.length;

  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {STEPS.map(({ key, label, icon: Icon, href, xp }, i) => {
          const isDone = steps[key];
          return (
            <a
              key={key}
              href={href}
              className="group flex items-center gap-2.5"
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                  isDone
                    ? "bg-[hsl(var(--strong-signal))]/15 text-[hsl(var(--strong-signal))]"
                    : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                }`}
              >
                {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </span>
              <span className="flex flex-col">
                <span
                  className={`text-sm font-medium ${
                    isDone ? "text-muted-foreground line-through" : "text-foreground"
                  }`}
                >
                  {label}
                </span>
                {!isDone && (
                  <span className="text-[11px] font-semibold text-primary">
                    +{xp} XP
                  </span>
                )}
              </span>
              {i < STEPS.length - 1 && (
                <span className="ml-3 hidden h-px w-6 bg-border sm:block" />
              )}
            </a>
          );
        })}

        <div className="ml-auto flex items-center gap-3">
          {hoursLogged > 0 && (
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
              {hoursLogged.toFixed(1)}h logged
            </span>
          )}
          {allDone && (
            <span className="rounded-full bg-[hsl(var(--strong-signal))]/10 px-2.5 py-1 text-xs font-semibold text-[hsl(var(--strong-signal))]">
              {isToday ? "Day complete — see you tomorrow" : "Day complete"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
