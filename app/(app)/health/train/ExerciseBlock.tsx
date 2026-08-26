"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Plus, Trash2, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { kindHas } from "@/lib/health/constants";
import { e1rm, kgToDisplay, displayToKg, type WeightUnit } from "@/lib/health/units";
import { addSet, deleteSet, removeExercise, updateSet } from "./actions";
import * as sessionTree from "./session";
import { useSessionStore } from "./store";
import type { ExerciseHistory, SessionExercise, SessionSet } from "./types";

const NUM_INPUT =
  "h-11 w-full rounded-md border border-border bg-background px-2 text-center text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary";

type Props = {
  block: SessionExercise;
  history: ExerciseHistory | undefined;
  weightUnit: WeightUnit;
  onSetLogged: () => void;
};

export function ExerciseBlock({
  block,
  history,
  weightUnit,
  onSetLogged,
}: Props) {
  const { session, patch, run } = useSessionStore();
  const { exercise, sets } = block;

  const showWeight = kindHas(exercise.kind, "w");
  const showReps = kindHas(exercise.kind, "r");
  const showDistance = kindHas(exercise.kind, "d");
  const showTime = kindHas(exercise.kind, "t");

  const workingSets = sets.filter((s) => !s.is_warmup);
  const bestE1rm = history?.bestE1rm ?? null;

  // Only the session's single best set can wear the badge. Flagging every set
  // that clears the old record — which is all of them the first time an
  // exercise is logged, or on any day that beats last month — turns the badge
  // into wallpaper.
  const prSetId = (() => {
    let bestId: string | null = null;
    let bestValue = bestE1rm ?? 0;
    for (const s of workingSets) {
      const value = e1rm(s.weight_kg, s.reps);
      if (value === null) continue;
      if (value > bestValue + 0.01) {
        bestValue = value;
        bestId = s.id;
      }
    }
    return bestId;
  })();

  /** Seed a new set from the last one entered, or from last session's opener. */
  const seedFromPrevious = (): Partial<SessionSet> => {
    const last = sets[sets.length - 1];
    if (last)
      return {
        weight_kg: last.weight_kg,
        reps: last.reps,
        distance_m: last.distance_m,
        duration_sec: last.duration_sec,
        is_warmup: false,
      };
    const lastSession = history?.lastSets?.[0];
    if (lastSession)
      return { weight_kg: lastSession.weight_kg, reps: lastSession.reps };
    return {};
  };

  const handleAddSet = async () => {
    const seed = seedFromPrevious();
    const tempId = crypto.randomUUID();
    const position = sessionTree.nextPosition(session);
    const optimistic: SessionSet = {
      id: tempId,
      exercise_id: exercise.id,
      position,
      weight_kg: seed.weight_kg ?? null,
      reps: seed.reps ?? null,
      distance_m: seed.distance_m ?? null,
      duration_sec: seed.duration_sec ?? null,
      is_warmup: false,
      rpe: null,
      notes: null,
    };

    const result = await run(
      (s) => sessionTree.addSet(s, exercise.id, optimistic),
      () =>
        addSet({
          workoutId: session.id,
          exerciseId: exercise.id,
          position,
          weightKg: optimistic.weight_kg,
          reps: optimistic.reps,
          distanceM: optimistic.distance_m,
          durationSec: optimistic.duration_sec,
        })
    );

    if (result.ok) {
      patch((s) =>
        sessionTree.mapSet(s, tempId, (set) => ({ ...set, id: result.data.id }))
      );
      onSetLogged();
    }
  };

  const handleRemoveExercise = () => {
    if (
      sets.length > 0 &&
      !confirm(`Remove ${exercise.name} and its ${sets.length} set(s)?`)
    )
      return;
    void run(
      (s) => sessionTree.removeExercise(s, exercise.id),
      () => removeExercise({ workoutId: session.id, exerciseId: exercise.id })
    );
  };

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">
            {exercise.name}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {history?.lastDate ? (
              <>
                Last{" "}
                {format(new Date(`${history.lastDate}T00:00:00`), "d MMM")}:{" "}
                {history.lastSets
                  .slice(0, 4)
                  .map((s) =>
                    s.weight_kg === null
                      ? `${s.reps ?? "—"}`
                      : `${kgToDisplay(s.weight_kg, weightUnit).toFixed(1)}×${s.reps ?? "—"}`
                  )
                  .join(", ")}
              </>
            ) : (
              <>First time logging this one.</>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={handleRemoveExercise}
          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="sr-only">Remove {exercise.name}</span>
        </button>
      </div>

      {sets.length > 0 && (
        <div className="mt-3 space-y-2">
          {sets.map((set, index) => (
            <SetRow
              key={set.id}
              set={set}
              // Warm-ups are excluded from the numbering: "set 3" should mean
              // the third working set, which is the one worth comparing.
              label={
                set.is_warmup
                  ? "W"
                  : String(workingSets.findIndex((s) => s.id === set.id) + 1)
              }
              index={index}
              showWeight={showWeight}
              showReps={showReps}
              showDistance={showDistance}
              showTime={showTime}
              weightUnit={weightUnit}
              isPr={set.id === prSetId}
              onLogged={onSetLogged}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={handleAddSet}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border py-2.5 text-sm font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
        {sets.length === 0 ? "Add first set" : "Same again"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SetRow({
  set,
  label,
  showWeight,
  showReps,
  showDistance,
  showTime,
  weightUnit,
  isPr,
  onLogged,
}: {
  set: SessionSet;
  label: string;
  index: number;
  showWeight: boolean;
  showReps: boolean;
  showDistance: boolean;
  showTime: boolean;
  weightUnit: WeightUnit;
  /** This set is the best the exercise has ever seen. */
  isPr: boolean;
  onLogged: () => void;
}) {
  const { patch, run } = useSessionStore();

  const [weight, setWeight] = useState(
    set.weight_kg === null
      ? ""
      : String(Number(kgToDisplay(set.weight_kg, weightUnit).toFixed(2)))
  );
  const [reps, setReps] = useState(set.reps === null ? "" : String(set.reps));
  const [distance, setDistance] = useState(
    set.distance_m === null ? "" : String(set.distance_m)
  );
  const [minutes, setMinutes] = useState(
    set.duration_sec === null ? "" : String(Math.round(set.duration_sec / 60))
  );

  // Persist a short beat after typing stops rather than on every keystroke:
  // typing "1", "1 2", "1 2 5" for 125kg must not be three round trips, and
  // waiting for a blur loses the set if the phone locks mid-rest.
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const parse = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  };

  const commit = (
    next: { weight?: string; reps?: string; distance?: string; minutes?: string },
    immediate = false
  ) => {
    const w = parse(next.weight ?? weight);
    const r = parse(next.reps ?? reps);
    const d = parse(next.distance ?? distance);
    const m = parse(next.minutes ?? minutes);

    const payload = {
      setId: set.id,
      weightKg: w === null ? null : displayToKg(w, weightUnit),
      reps: r === null ? null : Math.round(r),
      distanceM: d,
      durationSec: m === null ? null : Math.round(m * 60),
    };

    patch((s) =>
      sessionTree.mapSet(s, set.id, (row) => ({
        ...row,
        weight_kg: payload.weightKg,
        reps: payload.reps,
        distance_m: payload.distanceM,
        duration_sec: payload.durationSec,
      }))
    );

    if (timer.current) window.clearTimeout(timer.current);
    const send = () => {
      void run(
        (s) => s,
        () => updateSet(payload)
      );
      onLogged();
    };
    if (immediate) send();
    else timer.current = window.setTimeout(send, 600);
  };

  const handleWarmup = () => {
    const next = !set.is_warmup;
    void run(
      (s) => sessionTree.mapSet(s, set.id, (row) => ({ ...row, is_warmup: next })),
      () => updateSet({ setId: set.id, isWarmup: next })
    );
  };

  const handleDelete = () => {
    void run(
      (s) => sessionTree.removeSet(s, set.id),
      () => deleteSet(set.id)
    );
  };

  const currentE1rm = e1rm(set.weight_kg, set.reps);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleWarmup}
        title={set.is_warmup ? "Warm-up — tap to make it count" : "Mark as warm-up"}
        className={cn(
          "h-11 w-9 shrink-0 rounded-md border text-xs font-semibold transition-colors",
          set.is_warmup
            ? "border-border bg-background text-muted-foreground"
            : "border-primary/40 bg-primary/10 text-primary"
        )}
      >
        {label}
      </button>

      {showWeight && (
        <input
          type="number"
          inputMode="decimal"
          step="0.5"
          value={weight}
          onChange={(e) => {
            setWeight(e.target.value);
            commit({ weight: e.target.value });
          }}
          onBlur={() => commit({}, true)}
          placeholder={weightUnit}
          aria-label={`Set ${label} weight in ${weightUnit}`}
          className={NUM_INPUT}
        />
      )}

      {showReps && (
        <input
          type="number"
          inputMode="numeric"
          step="1"
          value={reps}
          onChange={(e) => {
            setReps(e.target.value);
            commit({ reps: e.target.value });
          }}
          onBlur={() => commit({}, true)}
          placeholder="reps"
          aria-label={`Set ${label} reps`}
          className={NUM_INPUT}
        />
      )}

      {showDistance && (
        <input
          type="number"
          inputMode="decimal"
          step="10"
          value={distance}
          onChange={(e) => {
            setDistance(e.target.value);
            commit({ distance: e.target.value });
          }}
          onBlur={() => commit({}, true)}
          placeholder="m"
          aria-label={`Set ${label} distance in metres`}
          className={NUM_INPUT}
        />
      )}

      {showTime && (
        <input
          type="number"
          inputMode="decimal"
          step="1"
          value={minutes}
          onChange={(e) => {
            setMinutes(e.target.value);
            commit({ minutes: e.target.value });
          }}
          onBlur={() => commit({}, true)}
          placeholder="min"
          aria-label={`Set ${label} duration in minutes`}
          className={NUM_INPUT}
        />
      )}

      {isPr && currentE1rm !== null && (
        <span
          title={`Best estimated 1RM yet: ${kgToDisplay(currentE1rm, weightUnit).toFixed(1)} ${weightUnit}`}
          className="flex h-11 shrink-0 items-center gap-1 rounded-md bg-[hsl(var(--progress-good))]/15 px-2 text-xs font-semibold text-[hsl(var(--progress-good))]"
        >
          <Trophy className="h-3.5 w-3.5" />
          PR
        </span>
      )}

      <button
        type="button"
        onClick={handleDelete}
        aria-label={`Delete set ${label}`}
        className="h-11 shrink-0 rounded-md px-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
