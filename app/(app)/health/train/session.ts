import type { ExerciseRow, Session, SessionSet } from "./types";

/** Pure updates on a Session tree, so the optimistic store stays trivial. */

export function nextPosition(session: Session): number {
  let max = -1;
  for (const ex of session.exercises)
    for (const s of ex.sets) if (s.position > max) max = s.position;
  return max + 1;
}

export function addExercise(session: Session, exercise: ExerciseRow): Session {
  if (session.exercises.some((e) => e.exercise.id === exercise.id))
    return session;
  return { ...session, exercises: [...session.exercises, { exercise, sets: [] }] };
}

export function removeExercise(session: Session, exerciseId: string): Session {
  return {
    ...session,
    exercises: session.exercises.filter((e) => e.exercise.id !== exerciseId),
  };
}

export function addSet(
  session: Session,
  exerciseId: string,
  set: SessionSet
): Session {
  return {
    ...session,
    exercises: session.exercises.map((e) =>
      e.exercise.id === exerciseId ? { ...e, sets: [...e.sets, set] } : e
    ),
  };
}

export function mapSet(
  session: Session,
  setId: string,
  update: (s: SessionSet) => SessionSet
): Session {
  return {
    ...session,
    exercises: session.exercises.map((e) => ({
      ...e,
      sets: e.sets.map((s) => (s.id === setId ? update(s) : s)),
    })),
  };
}

export function removeSet(session: Session, setId: string): Session {
  return {
    ...session,
    exercises: session.exercises.map((e) => ({
      ...e,
      sets: e.sets.filter((s) => s.id !== setId),
    })),
  };
}

export function allSets(session: Session): SessionSet[] {
  return session.exercises.flatMap((e) => e.sets);
}

/**
 * Group a flat set list into exercises, in the order they were first trained.
 *
 * Sets carry a position within the whole workout rather than within an
 * exercise, so this is what turns the database's flat list back into the
 * "one block per movement" shape the logger is built around.
 */
export function groupSets(
  sets: SessionSet[],
  exercisesById: Map<string, ExerciseRow>
): Session["exercises"] {
  const order: string[] = [];
  const byExercise = new Map<string, SessionSet[]>();

  for (const s of [...sets].sort((a, b) => a.position - b.position)) {
    if (!byExercise.has(s.exercise_id)) {
      byExercise.set(s.exercise_id, []);
      order.push(s.exercise_id);
    }
    byExercise.get(s.exercise_id)!.push(s);
  }

  return order.flatMap((id) => {
    const exercise = exercisesById.get(id);
    if (!exercise) return [];
    // A seeded row (all fields null, from "repeat last workout") stands for the
    // exercise itself rather than a real set, so it is not shown as one.
    const sets = (byExercise.get(id) ?? []).filter((s) => !isPlaceholder(s));
    return [{ exercise, sets }];
  });
}

/** A set with nothing recorded in it — the marker that holds an exercise's place. */
export function isPlaceholder(s: SessionSet): boolean {
  return (
    s.weight_kg === null &&
    s.reps === null &&
    s.distance_m === null &&
    s.duration_sec === null
  );
}
