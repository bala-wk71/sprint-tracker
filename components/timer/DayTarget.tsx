import type { TimerSettings } from "@/lib/timer/engine";

/** Today's hours against the daily target, with the sessions left to get there. */
export function DayTarget({
  loggedHours,
  breakHours,
  sessions,
  settings,
}: {
  loggedHours: number;
  breakHours: number;
  sessions: number;
  settings: TimerSettings;
}) {
  const target = settings.dailyTargetHours;
  const counted = loggedHours + (settings.countBreaks ? breakHours : 0);
  const pct = Math.min(100, Math.round((counted / target) * 100));
  const left = Math.max(0, target - counted);
  // A Pomodoro block is focus plus its break when breaks count, focus alone otherwise.
  const blockHours =
    (settings.focusMin + (settings.countBreaks ? settings.shortBreakMin : 0)) / 60;
  const sessionsLeft = Math.ceil(left / blockHours);

  return (
    <div className="space-y-1.5 border-t border-border pt-3">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-foreground">
          {counted.toFixed(1)}h of {target}h today
          {settings.countBreaks && breakHours > 0 && (
            <span className="font-normal text-muted-foreground"> · incl. {breakHours < 1 ? `${Math.round(breakHours * 60)} min` : `${breakHours.toFixed(1)}h`} breaks</span>
          )}
        </span>
        <span className="text-muted-foreground">
          {sessions} {sessions === 1 ? "session" : "sessions"} with the timer
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        {left <= 0
          ? "Daily target reached — anything more is a bonus."
          : `${left.toFixed(1)}h to go — about ${sessionsLeft} more ${settings.focusMin}-minute ${sessionsLeft === 1 ? "session" : "sessions"}.`}
      </p>
    </div>
  );
}
