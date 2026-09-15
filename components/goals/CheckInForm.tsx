"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { checkInOnGoal } from "@/app/(app)/goals/checkin-actions";

type Props = {
  goal: {
    id: string;
    trackType: string;
    unit: string | null;
    currentValue: number | null;
    startValue: number | null;
    isPrivate: boolean;
  };
};

export function CheckInForm({ goal }: Props) {
  const router = useRouter();
  const [value, setValue] = useState((goal.currentValue ?? goal.startValue)?.toString() ?? "");
  const [onTrack, setOnTrack] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const isNumber = goal.trackType === "number";
  const isFeeling = goal.trackType === "feeling";

  const submit = () => {
    let numeric: number | null = null;
    if (isNumber && value.trim() !== "") {
      numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        setError("Enter a plain number.");
        return;
      }
    }
    setError(null);
    setStatus(null);
    startTransition(async () => {
      const result = await checkInOnGoal({ goalId: goal.id, note, onTrack, value: numeric });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNote("");
      setOnTrack(null);
      setStatus(result.xp ? `Checked in · +${result.xp} XP` : "Checked in");
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {isNumber && (
        <div className="max-w-xs">
          <label htmlFor={`checkin_value_${goal.id}`} className="mb-1.5 block text-sm font-medium text-foreground">
            Where are you now?
          </label>
          <div className="flex items-center gap-2">
            <input
              id={`checkin_value_${goal.id}`}
              type="number"
              inputMode="decimal"
              step="any"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-primary sm:text-sm"
            />
            {goal.unit && <span className="text-sm text-muted-foreground">{goal.unit}</span>}
          </div>
        </div>
      )}

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-foreground">
          How on track does it feel?
          {!isFeeling && <span className="font-normal text-muted-foreground"> (optional)</span>}
        </legend>
        <div role="radiogroup" aria-label="How on track it feels, 1 to 10" className="flex flex-wrap gap-1">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={onTrack === n}
              onClick={() => setOnTrack(onTrack === n ? null : n)}
              className={cn(
                "h-8 w-8 rounded-md border text-sm tabular-nums transition-colors",
                onTrack === n
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">1 is way off, 10 is right on track.</p>
      </fieldset>

      <div>
        <label htmlFor={`checkin_note_${goal.id}`} className="mb-1.5 block text-sm font-medium text-foreground">
          A few words <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id={`checkin_note_${goal.id}`}
          value={note}
          rows={3}
          maxLength={5000}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What moved? What got in the way?"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary sm:text-sm"
        />
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Check in"}
        </button>
        {status ? (
          <span role="status" className="text-xs font-semibold text-primary">
            {status}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            {goal.isPrivate ? <Lock className="h-3 w-3" /> : <Users className="h-3 w-3" />}
            Saved to your journal · {goal.isPrivate ? "only you" : "your reviewers can see it"}
          </span>
        )}
      </div>
    </div>
  );
}
