"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  EVENING_MOODS,
  PRIORITY_STATUSES,
  type EveningMood,
  type PriorityStatus,
} from "@/lib/constants";
import { saveEveningWrapUp } from "./actions";

export type EveningPriority = {
  id: string;
  position: number;
  description: string;
  status: PriorityStatus;
};

type Props = {
  date: string;
  initialMood: EveningMood | null;
  initialProductivity: number | null;
  initialReflection: string;
  initialReflectionPrivate: boolean;
  initialImprovement: string;
  initialWin: string;
  initialGratitude: string;
  initialGratitudePrivate: boolean;
  priorities: EveningPriority[];
};

export function EveningWrapUp({
  date,
  initialMood,
  initialProductivity,
  initialReflection,
  initialReflectionPrivate,
  initialImprovement,
  initialWin,
  initialGratitude,
  initialGratitudePrivate,
  priorities,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mood, setMood] = useState<EveningMood | null>(initialMood);
  const [productivity, setProductivity] = useState<number>(initialProductivity ?? 5);
  const [reflection, setReflection] = useState(initialReflection);
  const [reflectionPrivate, setReflectionPrivate] = useState(initialReflectionPrivate);
  const [improvement, setImprovement] = useState(initialImprovement);
  const [win, setWin] = useState(initialWin);
  const [gratitude, setGratitude] = useState(initialGratitude);
  const [gratitudePrivate, setGratitudePrivate] = useState(initialGratitudePrivate);
  const [priorityStatuses, setPriorityStatuses] = useState<EveningPriority[]>(priorities);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [xpGained, setXpGained] = useState(0);

  const setStatus = (id: string, status: PriorityStatus) => {
    setPriorityStatuses((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status } : p))
    );
  };

  const handleSave = () => {
    setError(null);
    setSavedAt(null);
    startTransition(async () => {
      const result = await saveEveningWrapUp({
        date,
        closing_mood: mood,
        productivity_rating: productivity,
        reflection,
        reflection_private: reflectionPrivate,
        improvement,
        win,
        gratitude,
        gratitude_private: gratitudePrivate,
        priority_statuses: priorityStatuses.map((p) => ({
          id: p.id,
          status: p.status,
        })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSavedAt(new Date().toLocaleTimeString());
      setXpGained("xp" in result && result.xp ? result.xp : 0);
      router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      {/* Closing mood */}
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">
          Closing mood
        </label>
        <div className="flex flex-wrap gap-2">
          {EVENING_MOODS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMood(mood === m.value ? null : m.value)}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                mood === m.value
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              <span className="text-lg leading-none">{m.emoji}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Productivity slider */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="productivity" className="text-sm font-medium text-foreground">
            Productivity rating
          </label>
          <span className="text-sm font-semibold text-primary">{productivity}/10</span>
        </div>
        <input
          id="productivity"
          type="range"
          min="1"
          max="10"
          step="1"
          value={productivity}
          onChange={(e) => setProductivity(Number(e.target.value))}
          className="w-full accent-primary"
        />
      </div>

      {/* Priority review */}
      {priorityStatuses.length > 0 && (
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            How did your priorities go?
          </label>
          <div className="space-y-2">
            {priorityStatuses.map((p) => (
              <div
                key={p.id}
                className="rounded-md border border-border bg-background p-3"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                    {p.position}
                  </span>
                  <span className="text-sm text-foreground">{p.description}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {PRIORITY_STATUSES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setStatus(p.id, s.value)}
                      className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-colors ${
                        p.status === s.value
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                      }`}
                    >
                      <span>{s.emoji}</span>
                      <span>{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reflection */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="reflection" className="text-sm font-medium text-foreground">
            Reflection
          </label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={reflectionPrivate}
              onChange={(e) => setReflectionPrivate(e.target.checked)}
              className="h-3 w-3 rounded border-input"
            />
            Private
          </label>
        </div>
        <textarea
          id="reflection"
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
          rows={3}
          placeholder="What stood out today?"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Improvement + Win in two columns */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="improvement"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            One thing to improve
          </label>
          <textarea
            id="improvement"
            value={improvement}
            onChange={(e) => setImprovement(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label htmlFor="win" className="mb-2 block text-sm font-medium text-foreground">
            Today&apos;s win
          </label>
          <textarea
            id="win"
            value={win}
            onChange={(e) => setWin(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Gratitude */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="gratitude" className="text-sm font-medium text-foreground">
            Gratitude
          </label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={gratitudePrivate}
              onChange={(e) => setGratitudePrivate(e.target.checked)}
              className="h-3 w-3 rounded border-input"
            />
            Private
          </label>
        </div>
        <textarea
          id="gratitude"
          value={gratitude}
          onChange={(e) => setGratitude(e.target.value)}
          rows={2}
          placeholder="What are you grateful for?"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
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
          {pending ? "Saving…" : "Save evening wrap-up"}
        </button>
        {savedAt && (
          <span className="text-xs text-muted-foreground">
            Saved at {savedAt}
            {xpGained > 0 && (
              <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                +{xpGained} XP
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
