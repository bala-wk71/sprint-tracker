import {
  Flame,
  CalendarCheck,
  Shield,
  Sunrise,
  Timer,
  Moon,
  CheckSquare,
} from "lucide-react";
import type { LevelInfo, ShieldedStreak } from "@/lib/gamification";
import type { StreakResult } from "@/lib/streaks";

export type TodayStatus = {
  checkin: boolean;
  timeLogged: boolean;
  wrapup: boolean;
};

type Props = {
  level: LevelInfo;
  daily: ShieldedStreak;
  weekly: StreakResult;
  today: TodayStatus;
  todosDoneToday?: number;
};

export function GamificationHero({
  level,
  daily,
  weekly,
  today,
  todosDoneToday = 0,
}: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <LevelCard level={level} />
      <TodayCard today={today} todosDoneToday={todosDoneToday} />
      <DailyStreakCard daily={daily} />
      <WeeklyStreakCard weekly={weekly} />
    </div>
  );
}

function LevelCard({ level }: { level: LevelInfo }) {
  const pct = Math.min(100, Math.round((level.progress / level.span) * 100));
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          Level {level.level}
        </span>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
          {level.title}
        </span>
      </div>
      <p className="text-3xl font-bold text-foreground">
        {level.totalXp.toLocaleString()}
        <span className="ml-1 text-base font-normal text-muted-foreground">
          XP
        </span>
      </p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {level.span - level.progress} XP to level {level.level + 1}
      </p>
    </div>
  );
}

const TODAY_STEPS = [
  { key: "checkin", label: "Morning check-in", icon: Sunrise },
  { key: "timeLogged", label: "Log time", icon: Timer },
  { key: "wrapup", label: "Evening wrap-up", icon: Moon },
] as const;

function TodayCard({
  today,
  todosDoneToday,
}: {
  today: TodayStatus;
  todosDoneToday: number;
}) {
  const done = TODAY_STEPS.filter((s) => today[s.key]).length;
  const total = TODAY_STEPS.length;
  const r = 26;
  const circumference = 2 * Math.PI * r;
  const filled = (done / total) * circumference;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">Today</span>
        {done === total && (
          <span className="rounded-full bg-[hsl(var(--strong-signal))]/10 px-2 py-0.5 text-xs font-semibold text-[hsl(var(--strong-signal))]">
            Complete
          </span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <svg
          viewBox="0 0 64 64"
          className="h-16 w-16 shrink-0 -rotate-90"
          role="img"
          aria-label={`${done} of ${total} daily steps done`}
        >
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            strokeWidth="6"
            className="stroke-muted"
          />
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference - filled}`}
            className={
              done === total
                ? "stroke-[hsl(var(--strong-signal))]"
                : "stroke-primary"
            }
          />
          <text
            x="32"
            y="32"
            textAnchor="middle"
            dominantBaseline="central"
            transform="rotate(90 32 32)"
            className="fill-foreground text-[15px] font-bold"
          >
            {done}/{total}
          </text>
        </svg>
        <ul className="space-y-1">
          {TODAY_STEPS.map(({ key, label, icon: Icon }) => (
            <li
              key={key}
              className={`flex items-center gap-1.5 text-xs ${
                today[key]
                  ? "text-muted-foreground line-through"
                  : "font-medium text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {label}
            </li>
          ))}
          {todosDoneToday > 0 && (
            <li className="flex items-center gap-1.5 text-xs text-[hsl(var(--strong-signal))]">
              <CheckSquare className="h-3.5 w-3.5 shrink-0" />
              {todosDoneToday} todo{todosDoneToday === 1 ? "" : "s"} done
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function DailyStreakCard({ daily }: { daily: ShieldedStreak }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-[hsl(var(--weak-signal))]" />
          <span className="text-sm font-medium text-muted-foreground">
            Daily streak
          </span>
        </div>
        {daily.shields > 0 && (
          <div
            className="flex items-center gap-0.5"
            title={`${daily.shields} streak shield${daily.shields === 1 ? "" : "s"}: a missed day is covered automatically`}
          >
            {Array.from({ length: daily.shields }).map((_, i) => (
              <Shield
                key={i}
                className="h-3.5 w-3.5 fill-[hsl(var(--personal))]/20 text-[hsl(var(--personal))]"
              />
            ))}
          </div>
        )}
      </div>
      {daily.current > 0 ? (
        <>
          <p className="text-3xl font-bold text-foreground">
            {daily.current}
            <span className="ml-1 text-base font-normal text-muted-foreground">
              {daily.current === 1 ? "day" : "days"}
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {daily.shields > 0
              ? "protected by shields — every 7 days earns one"
              : "log 7 days in a row to earn a shield"}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Log anything today to start
        </p>
      )}
    </div>
  );
}

function WeeklyStreakCard({ weekly }: { weekly: StreakResult }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <CalendarCheck className="h-4 w-4 text-[hsl(var(--strong-signal))]" />
        <span className="text-sm font-medium text-muted-foreground">
          Weekly streak
        </span>
      </div>
      {weekly.current > 0 ? (
        <>
          <p className="text-3xl font-bold text-foreground">
            {weekly.current}
            <span className="ml-1 text-base font-normal text-muted-foreground">
              {weekly.current === 1 ? "week" : "weeks"}
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            weeks hitting at least half of every target
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Complete a sprint week to begin
        </p>
      )}
    </div>
  );
}
