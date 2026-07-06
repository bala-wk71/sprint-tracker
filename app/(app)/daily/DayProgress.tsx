import { Check, Moon, Sunrise, Timer, type LucideIcon } from "lucide-react";
import { TIME_LOG_XP_DAILY_CAP } from "@/lib/gamification";

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
  xpLabel: string;
}> = [
  { key: "checkin", label: "Morning check-in", icon: Sunrise, href: "#morning", xpLabel: "+10 XP" },
  {
    key: "timeLogged",
    label: "Log time",
    icon: Timer,
    href: "#time",
    xpLabel: `1 XP/h · max ${TIME_LOG_XP_DAILY_CAP}`,
  },
  { key: "wrapup", label: "Evening wrap-up", icon: Moon, href: "#evening", xpLabel: "+15 XP" },
];

const DAY_HOURS = 24;

type Props = {
  steps: DaySteps;
  hoursLogged: number;
  isToday: boolean;
};

export function DayProgress({ steps, hoursLogged, isToday }: Props) {
  const done = STEPS.filter((s) => steps[s.key]).length;
  const allDone = done === STEPS.length;

  const unaccounted = DAY_HOURS - hoursLogged;
  const overDay = unaccounted < 0;
  const coveragePct = Math.min((hoursLogged / DAY_HOURS) * 100, 100);

  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {STEPS.map(({ key, label, icon: Icon, href, xpLabel }, i) => {
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
                    {xpLabel}
                  </span>
                )}
              </span>
              {i < STEPS.length - 1 && (
                <span className="ml-3 hidden h-px w-6 bg-border sm:block" />
              )}
            </a>
          );
        })}

        {allDone && (
          <span className="ml-auto rounded-full bg-[hsl(var(--strong-signal))]/10 px-2.5 py-1 text-xs font-semibold text-[hsl(var(--strong-signal))]">
            {isToday ? "Day complete — see you tomorrow" : "Day complete"}
          </span>
        )}
      </div>

      {/* Day coverage: every hour lives somewhere — the gap is what slipped by. */}
      <div className="mt-3 border-t border-border pt-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs">
          <p className="text-muted-foreground">
            <span className="text-sm font-semibold text-foreground">
              {Number(hoursLogged.toFixed(1))}h
            </span>{" "}
            of the day&apos;s {DAY_HOURS}h accounted for
          </p>
          <p
            className={
              overDay
                ? "font-medium text-destructive"
                : "font-medium text-muted-foreground"
            }
          >
            {overDay
              ? `${Number((-unaccounted).toFixed(1))}h over 24h — check your entries`
              : `${Number(unaccounted.toFixed(1))}h unaccounted`}
          </p>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${
              overDay ? "bg-destructive" : "bg-primary"
            }`}
            style={{ width: `${coveragePct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
