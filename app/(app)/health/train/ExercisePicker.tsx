"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { EQUIPMENT, MUSCLE_GROUPS } from "@/lib/health/constants";
import { createExercise } from "./actions";
import type { ExerciseRow } from "./types";

const INPUT =
  "h-11 w-full rounded-md border border-border bg-background px-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary";

type Props = {
  library: ExerciseRow[];
  /** Exercise ids used most recently, newest first — these sort to the top. */
  recentIds: string[];
  /** Already in this session; shown greyed rather than hidden. */
  usedIds: string[];
  onPick: (exercise: ExerciseRow) => void;
  onClose: () => void;
};

export function ExercisePicker({
  library,
  recentIds,
  usedIds,
  onPick,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [muscleGroup, setMuscleGroup] = useState("chest");
  const [equipment, setEquipment] = useState("barbell");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const recentRank = useMemo(() => {
    const rank = new Map<string, number>();
    recentIds.forEach((id, i) => rank.set(id, i));
    return rank;
  }, [recentIds]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? library.filter(
          (e) =>
            e.name.toLowerCase().includes(q) ||
            e.muscle_group.toLowerCase().includes(q)
        )
      : library;

    // What you trained last week beats alphabetical order — the catalogue has
    // 115 entries and you use eight of them.
    return [...matches]
      .sort((a, b) => {
        const ra = recentRank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const rb = recentRank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        if (ra !== rb) return ra - rb;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 40);
  }, [library, query, recentRank]);

  const used = new Set(usedIds);
  const exactMatch = library.some(
    (e) => e.name.toLowerCase() === query.trim().toLowerCase()
  );

  const handleCreate = () => {
    const name = query.trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      const result = await createExercise({
        name,
        muscleGroup,
        equipment,
        // Weight and reps covers almost everything; a cardio machine can be
        // corrected afterwards, and guessing wrong here costs one edit.
        kind: "wr",
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onPick({
        id: result.data.id,
        name,
        muscle_group: muscleGroup,
        equipment,
        kind: "wr",
        owner_id: "self",
      });
      setQuery("");
      setCreating(false);
      inputRef.current?.focus();
    });
  };

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "Enter" && results.length > 0) onPick(results[0]);
            }}
            placeholder="Search exercises…"
            className={cn(INPUT, "pl-9")}
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Close picker"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
        {results.map((exercise) => {
          const isUsed = used.has(exercise.id);
          return (
            <button
              key={exercise.id}
              type="button"
              onClick={() => onPick(exercise)}
              className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-accent"
            >
              <span
                className={cn(
                  "text-sm font-medium",
                  isUsed ? "text-muted-foreground" : "text-foreground"
                )}
              >
                {exercise.name}
                {isUsed && (
                  <span className="ml-2 text-xs font-normal">
                    already in this session
                  </span>
                )}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {exercise.muscle_group} · {exercise.equipment}
              </span>
            </button>
          );
        })}

        {results.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Nothing matches “{query}”.
          </p>
        )}
      </div>

      {/* Creating from the search box: whatever was typed is the name, so a
          movement the catalogue doesn't have costs one extra tap, not a
          detour into a settings screen. */}
      {query.trim() !== "" && !exactMatch && (
        <div className="mt-3 border-t border-border pt-3">
          {!creating ? (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
            >
              <Plus className="h-3.5 w-3.5" />
              Create “{query.trim()}”
            </button>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  value={muscleGroup}
                  onChange={(e) => setMuscleGroup(e.target.value)}
                  className={INPUT}
                  aria-label="Muscle group"
                >
                  {MUSCLE_GROUPS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  value={equipment}
                  onChange={(e) => setEquipment(e.target.value)}
                  className={INPUT}
                  aria-label="Equipment"
                >
                  {EQUIPMENT.map((eq) => (
                    <option key={eq} value={eq}>
                      {eq}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={pending}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {pending ? "Adding…" : `Add “${query.trim()}”`}
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
