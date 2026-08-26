export type ExerciseRow = {
  id: string;
  name: string;
  muscle_group: string;
  equipment: string;
  kind: string;
  /** null for the built-in catalogue, set for the user's own additions. */
  owner_id: string | null;
};

export type SessionSet = {
  id: string;
  exercise_id: string;
  position: number;
  weight_kg: number | null;
  reps: number | null;
  distance_m: number | null;
  duration_sec: number | null;
  is_warmup: boolean;
  rpe: number | null;
  notes: string | null;
};

/** Sets of one exercise, grouped out of the session's flat set list. */
export type SessionExercise = {
  exercise: ExerciseRow;
  sets: SessionSet[];
};

export type Session = {
  id: string;
  log_date: string;
  name: string | null;
  started_at: string | null;
  ended_at: string | null;
  rpe: number | null;
  notes: string | null;
  exercises: SessionExercise[];
};

/**
 * What this exercise looked like last time, and the best it has ever been.
 *
 * Both are computed on the server from recent history so a set row can say
 * "last time: 60kg × 8" without another round trip, and so beating the record
 * can be recognised the moment the number is typed.
 */
export type ExerciseHistory = {
  exerciseId: string;
  lastDate: string | null;
  lastSets: { weight_kg: number | null; reps: number | null }[];
  /** Best e1RM across all loaded history, warm-ups excluded. */
  bestE1rm: number | null;
  bestWeightKg: number | null;
};

export type HistoryEntry = {
  id: string;
  log_date: string;
  name: string | null;
  setCount: number;
  volumeKg: number;
  exerciseNames: string[];
};
