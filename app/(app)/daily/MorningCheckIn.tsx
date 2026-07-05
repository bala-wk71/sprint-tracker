"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MORNING_MOODS, INTENTION_MAX_LENGTH, type MorningMood } from "@/lib/constants";
import { saveMorningCheckIn } from "./actions";

export type MorningPriority = {
  position: number;
  description: string;
  target_hours: number;
};

type Props = {
  date: string;
  initialMood: MorningMood | null;
  initialEnergy: number | null;
  initialIntention: string;
  initialPriorities: MorningPriority[];
};

const EMPTY_PRIORITIES: MorningPriority[] = [
  { position: 1, description: "", target_hours: 0 },
  { position: 2, description: "", target_hours: 0 },
  { position: 3, description: "", target_hours: 0 },
];

export function MorningCheckIn({
  date,
  initialMood,
  initialEnergy,
  initialIntention,
  initialPriorities,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mood, setMood] = useState<MorningMood | null>(initialMood);
  const [energy, setEnergy] = useState<number>(initialEnergy ?? 5);
  const [intention, setIntention] = useState(initialIntention);
  const [priorities, setPriorities] = useState<MorningPriority[]>(() => {
    const merged = [...EMPTY_PRIORITIES];
    for (const p of initialPriorities) {
      merged[p.position - 1] = p;
    }
    return merged;
  });
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [xpGained, setXpGained] = useState(0);

  const updatePriority = (idx: number, patch: Partial<MorningPriority>) => {
    setPriorities((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const handleSave = () => {
    setError(null);
    setSavedAt(null);
    startTransition(async () => {
      const result = await saveMorningCheckIn({
        date,
        morning_mood: mood,
        morning_energy: energy,
        daily_intention: intention,
        priorities: priorities
          .filter((p) => p.description.trim().length > 0)
          .map((p) => ({
            position: p.position,
            description: p.description,
            target_hours: p.target_hours,
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
      {/* Mood */}
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">
          How are you feeling?
        </label>
        <div className="flex flex-wrap gap-2">
          {MORNING_MOODS.map((m) => (
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

      {/* Energy slider */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="energy" className="text-sm font-medium text-foreground">
            Energy level
          </label>
          <span className="text-sm font-semibold text-primary">{energy}/10</span>
        </div>
        <input
          id="energy"
          type="range"
          min="1"
          max="10"
          step="1"
          value={energy}
          onChange={(e) => setEnergy(Number(e.target.value))}
          className="w-full accent-primary"
        />
      </div>

      {/* Intention */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="intention" className="text-sm font-medium text-foreground">
            Daily intention
          </label>
          <span
            className={`text-xs ${
              intention.length > INTENTION_MAX_LENGTH
                ? "text-destructive"
                : "text-muted-foreground"
            }`}
          >
            {intention.length}/{INTENTION_MAX_LENGTH}
          </span>
        </div>
        <textarea
          id="intention"
          value={intention}
          onChange={(e) => setIntention(e.target.value.slice(0, INTENTION_MAX_LENGTH))}
          rows={2}
          placeholder="What's the one thing you want today to be about?"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Top 3 priorities */}
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">
          Top 3 priorities
        </label>
        <div className="space-y-2">
          {priorities.map((p, idx) => (
            <div
              key={p.position}
              className="grid grid-cols-[2rem_1fr_4rem] gap-2 sm:grid-cols-[2rem_1fr_5rem]"
            >
              <span className="flex h-9 w-8 items-center justify-center rounded-md bg-muted text-sm font-semibold text-muted-foreground">
                {p.position}
              </span>
              <input
                type="text"
                value={p.description}
                onChange={(e) =>
                  updatePriority(idx, { description: e.target.value })
                }
                placeholder={`Priority ${p.position}`}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                type="number"
                min="0"
                step="0.5"
                value={p.target_hours}
                onChange={(e) =>
                  updatePriority(idx, { target_hours: Number(e.target.value) })
                }
                placeholder="hrs"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          ))}
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
          {pending ? "Saving…" : "Save morning check-in"}
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
