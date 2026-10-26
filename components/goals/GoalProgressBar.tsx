import { cn } from "@/lib/utils";
import { formatValue, goalProgress } from "@/lib/goals/progress";
import type { TypedProgress } from "@/lib/goals/typed";

type Props = {
  trackType: string;
  startValue: number | null;
  targetValue: number | null;
  currentValue: number | null;
  unit: string | null;
  stepsDone: number;
  stepsTotal: number;
  /** On-track ratings, newest first. */
  feelings: number[];
  /** A Target's or Habit's read, from loadTypedProgress. */
  typed?: TypedProgress | null;
};

const TRACK = "h-1.5 overflow-hidden rounded-full bg-muted";
const LABEL = "shrink-0 text-xs tabular-nums text-muted-foreground";

/** Weeks shown as dots before the line falls back to a bar. */
const HABIT_DOTS = 12;

/** One compact progress line for any kind of goal. */
export function GoalProgressBar(p: Props) {
  if (p.typed?.kind === "habit") {
    const { habit } = p.typed;
    const recent = habit.weeks.slice(-HABIT_DOTS);
    return (
      <div className="flex items-center gap-3">
        <div className="flex h-2.5 max-w-xs flex-1 items-center gap-1" aria-hidden>
          {recent.map((w) => (
            <span
              key={w.start}
              className={cn(
                "h-2.5 flex-1 rounded-sm",
                w.kept ? (w.hit ? "bg-progress-good" : "bg-primary") : w.current ? "border border-primary/50" : "bg-muted"
              )}
            />
          ))}
        </div>
        <span className={LABEL}>{p.typed.label}</span>
      </div>
    );
  }

  if (p.typed?.kind === "target") {
    return (
      <div className="flex items-center gap-3">
        <div className={cn(TRACK, "max-w-xs flex-1")} aria-hidden>
          <div className="h-full rounded-full bg-primary" style={{ width: `${(p.typed.pct ?? 0) * 100}%` }} />
        </div>
        <span className={cn(LABEL, "min-w-0 truncate")}>{p.typed.label}</span>
      </div>
    );
  }

  if (p.trackType === "habit") return <p className={LABEL}>Weekly habit</p>;
  if (p.trackType === "number" && p.targetValue === null) return <p className={LABEL}>No number yet</p>;

  if (p.trackType === "steps") {
    if (p.stepsTotal === 0) return <p className={LABEL}>No steps yet</p>;
    const segmented = p.stepsTotal <= 12;
    return (
      <div className="flex items-center gap-3">
        {segmented ? (
          <div className="flex h-1.5 max-w-xs flex-1 gap-0.5" aria-hidden>
            {Array.from({ length: p.stepsTotal }, (_, i) => (
              <span
                key={i}
                className={cn("flex-1 rounded-sm", i < p.stepsDone ? "bg-primary" : "bg-muted")}
              />
            ))}
          </div>
        ) : (
          <div className={cn(TRACK, "max-w-xs flex-1")} aria-hidden>
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${(p.stepsDone / p.stepsTotal) * 100}%` }}
            />
          </div>
        )}
        <span className={LABEL}>
          {p.stepsDone} of {p.stepsTotal} steps
        </span>
      </div>
    );
  }

  if (p.trackType === "number") {
    const pct = goalProgress({
      track_type: "number",
      start_value: p.startValue,
      target_value: p.targetValue,
      current_value: p.currentValue,
    });
    return (
      <div className="flex items-center gap-3">
        <div className={cn(TRACK, "max-w-xs flex-1")} aria-hidden>
          <div className="h-full rounded-full bg-primary" style={{ width: `${(pct ?? 0) * 100}%` }} />
        </div>
        <span className={LABEL}>
          Now {formatValue(p.currentValue ?? p.startValue, p.unit)} · target{" "}
          {formatValue(p.targetValue, p.unit)}
        </span>
      </div>
    );
  }

  if (p.feelings.length === 0) return <p className={LABEL}>No check-ins yet</p>;
  const recent = p.feelings.slice(0, 6).reverse();
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-5 items-end gap-1" aria-hidden>
        {recent.map((rating, i) => (
          <span
            key={i}
            className={cn("w-2 rounded-t-sm", i === recent.length - 1 ? "bg-primary" : "bg-primary/40")}
            style={{ height: `${rating * 10}%` }}
          />
        ))}
      </div>
      <span className={LABEL}>Feels {p.feelings[0]} of 10</span>
    </div>
  );
}
