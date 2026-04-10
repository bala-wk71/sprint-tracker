"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveWeeklyReflection } from "./actions";

type Props = {
  sprintId: string;
  initialWentWell: string;
  initialImprove: string;
  initialLesson: string;
};

export function WeeklyReflection({
  sprintId,
  initialWentWell,
  initialImprove,
  initialLesson,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [wentWell, setWentWell] = useState(initialWentWell);
  const [improve, setImprove] = useState(initialImprove);
  const [lesson, setLesson] = useState(initialLesson);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const handleSave = () => {
    setError(null);
    setSavedAt(null);
    startTransition(async () => {
      const result = await saveWeeklyReflection({
        sprint_id: sprintId,
        reflection_went_well: wentWell,
        reflection_improve: improve,
        reflection_lesson: lesson,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSavedAt(new Date().toLocaleTimeString());
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label
            htmlFor="went-well"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            What went well
          </label>
          <textarea
            id="went-well"
            value={wentWell}
            onChange={(e) => setWentWell(e.target.value)}
            rows={4}
            placeholder="Wins, breakthroughs, what worked…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label
            htmlFor="improve"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            What to improve
          </label>
          <textarea
            id="improve"
            value={improve}
            onChange={(e) => setImprove(e.target.value)}
            rows={4}
            placeholder="What didn't work, what to change…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label
            htmlFor="lesson"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            Lesson learned
          </label>
          <textarea
            id="lesson"
            value={lesson}
            onChange={(e) => setLesson(e.target.value)}
            rows={4}
            placeholder="One key insight to carry forward…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save reflection"}
        </button>
        {savedAt && (
          <span className="text-xs text-muted-foreground">Saved at {savedAt}</span>
        )}
      </div>
    </div>
  );
}
