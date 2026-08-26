"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Dumbbell, Plus, Trash2 } from "lucide-react";
import { e1rm, kgToDisplay, totalVolume, type WeightUnit } from "@/lib/health/units";
import {
  addSet,
  deleteWorkout,
  finishWorkout,
  renameWorkout,
} from "./actions";
import { ExerciseBlock } from "./ExerciseBlock";
import { ExercisePicker } from "./ExercisePicker";
import { RestTimer } from "./RestTimer";
import * as sessionTree from "./session";
import { SessionProvider, useSessionStore } from "./store";
import type { ExerciseHistory, ExerciseRow, Session } from "./types";

type Props = {
  session: Session;
  library: ExerciseRow[];
  recentIds: string[];
  history: ExerciseHistory[];
  weightUnit: WeightUnit;
};

export function WorkoutSession(props: Props) {
  return (
    <SessionProvider initialSession={props.session}>
      <SessionBody {...props} />
    </SessionProvider>
  );
}

function SessionBody({ library, recentIds, history, weightUnit }: Props) {
  const router = useRouter();
  const { session, patch, run } = useSessionStore();
  const [picking, setPicking] = useState(false);
  const [lastSetAt, setLastSetAt] = useState<number | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [xpGained, setXpGained] = useState(0);

  const historyById = new Map(history.map((h) => [h.exerciseId, h]));
  const sets = sessionTree.allSets(session).filter((s) => !sessionTree.isPlaceholder(s));
  const volume = totalVolume(sets);
  const workingSets = sets.filter((s) => !s.is_warmup).length;

  const prCount = session.exercises.reduce((count, block) => {
    const best = historyById.get(block.exercise.id)?.bestE1rm ?? null;
    const beat = block.sets.some((s) => {
      if (s.is_warmup) return false;
      const value = e1rm(s.weight_kg, s.reps);
      return value !== null && (best === null || value > best + 0.01);
    });
    return count + (beat ? 1 : 0);
  }, 0);

  const handlePick = async (exercise: ExerciseRow) => {
    setPicking(false);
    if (session.exercises.some((e) => e.exercise.id === exercise.id)) return;

    // A set row is what holds an exercise in the session, so a new exercise is
    // seeded with an empty one. It is filtered out of the display until it has
    // something in it.
    const position = sessionTree.nextPosition(session);
    await run(
      (s) => sessionTree.addExercise(s, exercise),
      () =>
        addSet({
          workoutId: session.id,
          exerciseId: exercise.id,
          position,
        })
    );
  };

  const handleFinish = () => {
    setFinishing(true);
    void (async () => {
      const result = await finishWorkout({ workoutId: session.id });
      setFinishing(false);
      if (!result.ok) return;
      setXpGained("xp" in result && result.xp ? result.xp : 0);
      router.refresh();
    })();
  };

  const handleDelete = () => {
    if (!confirm("Delete this whole session?")) return;
    void (async () => {
      const result = await deleteWorkout(session.id);
      if (result.ok) router.push("/health/train");
    })();
  };

  const isFinished = session.ended_at !== null;

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
      {/* The name takes its own row on a phone: sharing one with Finish and
          Delete squeezed it to about twelve characters. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="w-full min-w-0 sm:w-auto sm:flex-1">
          <input
            value={session.name ?? ""}
            onChange={(e) => {
              const name = e.target.value;
              patch((s) => ({ ...s, name }));
            }}
            onBlur={(e) =>
              void renameWorkout({
                workoutId: session.id,
                name: e.target.value.trim() || null,
              })
            }
            placeholder="Name this session (Push day, Legs…)"
            className="w-full max-w-sm rounded-md border border-transparent bg-transparent px-2 py-1 text-lg font-semibold text-foreground placeholder:font-normal placeholder:text-muted-foreground hover:border-border focus:border-border focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="mt-1 px-2 text-xs text-muted-foreground">
            {workingSets} working set{workingSets === 1 ? "" : "s"} ·{" "}
            {kgToDisplay(volume, weightUnit).toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}{" "}
            {weightUnit} volume
            {prCount > 0 && (
              <span className="ml-1 font-semibold text-[hsl(var(--progress-good))]">
                · {prCount} PR{prCount === 1 ? "" : "s"}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {xpGained > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              +{xpGained} XP
            </span>
          )}
          {!isFinished ? (
            <button
              type="button"
              onClick={handleFinish}
              disabled={finishing || sets.length === 0}
              title={
                sets.length === 0 ? "Log at least one set first" : undefined
              }
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              {finishing ? "Finishing…" : "Finish"}
            </button>
          ) : (
            <span className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--progress-good))]" />
              Finished
            </span>
          )}
          <button
            type="button"
            onClick={handleDelete}
            aria-label="Delete session"
            className="rounded-md px-2 py-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!isFinished && (
        <div className="mt-4">
          <RestTimer startedAt={lastSetAt} />
        </div>
      )}

      <div className="mt-4 space-y-3">
        {session.exercises.map((block) => (
          <ExerciseBlock
            key={block.exercise.id}
            block={block}
            history={historyById.get(block.exercise.id)}
            weightUnit={weightUnit}
            onSetLogged={() => setLastSetAt(Date.now())}
          />
        ))}

        {session.exercises.length === 0 && !picking && (
          <div className="rounded-md border border-dashed border-border p-8 text-center">
            <Dumbbell className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              Add the first exercise to get going.
            </p>
          </div>
        )}

        {picking ? (
          <ExercisePicker
            library={library}
            recentIds={recentIds}
            usedIds={session.exercises.map((e) => e.exercise.id)}
            onPick={handlePick}
            onClose={() => setPicking(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-border py-3 text-sm font-medium text-foreground hover:bg-accent"
          >
            <Plus className="h-4 w-4" />
            Add exercise
          </button>
        )}
      </div>
    </div>
  );
}
