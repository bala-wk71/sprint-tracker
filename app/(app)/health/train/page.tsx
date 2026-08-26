import Link from "next/link";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createClient, getUser } from "@/lib/supabase/server";
import { todayIsoLocal } from "@/lib/dates";
import { readHealthProfile } from "@/lib/health/profile";
import { e1rm, kgToDisplay } from "@/lib/health/units";
import { StartWorkout } from "./StartWorkout";
import { WorkoutSession } from "./WorkoutSession";
import * as sessionTree from "./session";
import type {
  ExerciseHistory,
  ExerciseRow,
  HistoryEntry,
  Session,
  SessionSet,
} from "./types";

// History is capped rather than unbounded: after a FitNotes import a heavily
// used exercise can carry thousands of sets, and the last year is more than
// enough to say what "last time" and "your best" were.
const HISTORY_DAYS = 365;
const HISTORY_SET_CAP = 3000;

function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function shiftIso(date: string, days: number): string {
  return format(
    new Date(Date.parse(`${date}T00:00:00`) + days * 86_400_000),
    "yyyy-MM-dd"
  );
}

export default async function TrainPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const todayIso = await todayIsoLocal();
  const date =
    params.date && isValidIsoDate(params.date) ? params.date : todayIso;

  const [profile, { data: libraryRows }, { data: dayWorkouts }] =
    await Promise.all([
      readHealthProfile(supabase, user.id),
      supabase
        .from("exercises")
        .select("id, name, muscle_group, equipment, kind, owner_id")
        .eq("is_archived", false)
        .order("name"),
      supabase
        .from("workouts")
        .select("id, log_date, name, started_at, ended_at, rpe, notes")
        .eq("owner_id", user.id)
        .eq("log_date", date)
        .order("created_at"),
    ]);

  const library = (libraryRows ?? []) as ExerciseRow[];
  const libraryById = new Map(library.map((e) => [e.id, e]));
  const workouts = dayWorkouts ?? [];

  // Sets for the day being viewed, plus the history window behind it. One
  // query each rather than one per exercise.
  const [{ data: daySets }, { data: pastSets }, { data: recentWorkouts }] =
    await Promise.all([
      workouts.length > 0
        ? supabase
            .from("workout_sets")
            .select(
              "id, workout_id, exercise_id, position, weight_kg, reps, distance_m, duration_sec, is_warmup, rpe, notes"
            )
            .in(
              "workout_id",
              workouts.map((w) => w.id)
            )
            .order("position")
        : Promise.resolve({ data: [] as never[] }),
      supabase
        .from("workout_sets")
        .select(
          "exercise_id, weight_kg, reps, distance_m, duration_sec, is_warmup, workouts!inner(log_date)"
        )
        .eq("owner_id", user.id)
        .gte("workouts.log_date", shiftIso(date, -HISTORY_DAYS))
        .lt("workouts.log_date", date)
        .order("position")
        .limit(HISTORY_SET_CAP),
      supabase
        .from("workouts")
        .select("id, log_date, name, ended_at")
        .eq("owner_id", user.id)
        .lt("log_date", date)
        .order("log_date", { ascending: false })
        .limit(8),
    ]);

  // ------------------------------------------------------------- sessions
  const sessions: Session[] = workouts.map((w) => {
    const sets: SessionSet[] = (daySets ?? [])
      .filter((s) => s.workout_id === w.id)
      .map((s) => ({
        id: s.id,
        exercise_id: s.exercise_id,
        position: s.position,
        weight_kg: s.weight_kg,
        reps: s.reps,
        distance_m: s.distance_m,
        duration_sec: s.duration_sec,
        is_warmup: s.is_warmup,
        rpe: s.rpe,
        notes: s.notes,
      }));
    return {
      id: w.id,
      log_date: w.log_date,
      name: w.name,
      started_at: w.started_at,
      ended_at: w.ended_at,
      rpe: w.rpe,
      notes: w.notes,
      exercises: sessionTree.groupSets(sets, libraryById),
    };
  });

  // ------------------------------------------------------------- history
  type PastRow = {
    exercise_id: string;
    weight_kg: number | null;
    reps: number | null;
    distance_m: number | null;
    duration_sec: number | null;
    is_warmup: boolean;
    workouts: { log_date: string } | { log_date: string }[] | null;
  };

  const byExercise = new Map<
    string,
    { date: string; weight_kg: number | null; reps: number | null }[]
  >();

  for (const row of (pastSets ?? []) as PastRow[]) {
    if (row.is_warmup) continue;
    // Placeholder rows hold an exercise's place in a session and record
    // nothing, so they must not show up as an empty set in "last time" or
    // inflate a session's set count.
    if (
      row.weight_kg === null &&
      row.reps === null &&
      row.distance_m === null &&
      row.duration_sec === null
    )
      continue;
    const joined = Array.isArray(row.workouts) ? row.workouts[0] : row.workouts;
    if (!joined) continue;
    const list = byExercise.get(row.exercise_id) ?? [];
    list.push({
      date: joined.log_date,
      weight_kg: row.weight_kg,
      reps: row.reps,
    });
    byExercise.set(row.exercise_id, list);
  }

  const history: ExerciseHistory[] = [...byExercise.entries()].map(
    ([exerciseId, rows]) => {
      const lastDate = rows.reduce(
        (latest, r) => (r.date > latest ? r.date : latest),
        rows[0].date
      );
      let bestE1rm: number | null = null;
      let bestWeightKg: number | null = null;
      for (const r of rows) {
        const value = e1rm(r.weight_kg, r.reps);
        if (value !== null && (bestE1rm === null || value > bestE1rm))
          bestE1rm = value;
        if (
          r.weight_kg !== null &&
          (bestWeightKg === null || r.weight_kg > bestWeightKg)
        )
          bestWeightKg = r.weight_kg;
      }
      return {
        exerciseId,
        lastDate,
        lastSets: rows
          .filter((r) => r.date === lastDate)
          .map((r) => ({ weight_kg: r.weight_kg, reps: r.reps })),
        bestE1rm,
        bestWeightKg,
      };
    }
  );

  // Exercises most recently trained, newest first — what the picker sorts by.
  const lastTrained = (rows: { date: string }[]) =>
    rows.reduce((latest, r) => (r.date > latest ? r.date : latest), "");

  const recentIds = [...byExercise.entries()]
    .sort((a, b) => lastTrained(b[1]).localeCompare(lastTrained(a[1])))
    .map(([exerciseId]) => exerciseId);

  // --------------------------------------------------------- last workout
  const lastWorkoutId = recentWorkouts?.[0]?.id ?? null;
  const lastExerciseCount = lastWorkoutId
    ? new Set(
        ((pastSets ?? []) as PastRow[])
          .filter((r) => {
            const joined = Array.isArray(r.workouts) ? r.workouts[0] : r.workouts;
            return joined?.log_date === recentWorkouts?.[0]?.log_date;
          })
          .map((r) => r.exercise_id)
      ).size
    : 0;

  // -------------------------------------------------------------- recents
  // Summarised from the same history window, so the list costs no extra query.
  const perDate = new Map<
    string,
    { sets: number; volume: number; exercises: Set<string> }
  >();
  for (const [exerciseId, rows] of byExercise) {
    for (const r of rows) {
      const day = perDate.get(r.date) ?? {
        sets: 0,
        volume: 0,
        exercises: new Set<string>(),
      };
      day.sets += 1;
      day.volume += (r.weight_kg ?? 0) * (r.reps ?? 0);
      day.exercises.add(exerciseId);
      perDate.set(r.date, day);
    }
  }

  const recentEntries: HistoryEntry[] = (recentWorkouts ?? []).map((w) => {
    const day = perDate.get(w.log_date);
    return {
      id: w.id,
      log_date: w.log_date,
      name: w.name,
      setCount: day?.sets ?? 0,
      volumeKg: day?.volume ?? 0,
      exerciseNames: [...(day?.exercises ?? [])]
        .map((id) => libraryById.get(id)?.name)
        .filter((n): n is string => Boolean(n)),
    };
  });

  const isToday = date === todayIso;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/health/train?date=${shiftIso(date, -1)}`}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Prev</span>
        </Link>
        <span className="text-sm font-medium text-foreground">
          {format(new Date(`${date}T00:00:00`), "EEE, d MMM yyyy")}
        </span>
        <Link
          href={
            shiftIso(date, 1) === todayIso
              ? "/health/train"
              : `/health/train?date=${shiftIso(date, 1)}`
          }
          aria-disabled={isToday}
          className={`inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent ${
            isToday ? "pointer-events-none opacity-40" : ""
          }`}
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
        {!isToday && (
          <Link
            href="/health/train"
            className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Today
          </Link>
        )}
      </div>

      {sessions.length === 0 ? (
        <StartWorkout
          logDate={date}
          lastWorkout={
            recentWorkouts?.[0]
              ? {
                  log_date: recentWorkouts[0].log_date,
                  name: recentWorkouts[0].name,
                  exerciseCount: lastExerciseCount,
                }
              : null
          }
        />
      ) : (
        sessions.map((session) => (
          <WorkoutSession
            key={session.id}
            session={session}
            library={library}
            recentIds={recentIds}
            history={history}
            weightUnit={profile.weight_unit}
          />
        ))
      )}

      {recentEntries.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-foreground">
            Recent sessions
          </h2>
          <ul className="mt-3 divide-y divide-border">
            {recentEntries.map((entry) => (
              <li key={entry.id}>
                <Link
                  href={`/health/train?date=${entry.log_date}`}
                  className="flex items-start justify-between gap-3 py-2.5 hover:bg-accent"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">
                      {entry.name ??
                        entry.exerciseNames.slice(0, 3).join(", ") ??
                        "Session"}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {entry.setCount} set{entry.setCount === 1 ? "" : "s"}
                      {entry.volumeKg > 0 && (
                        <>
                          {" · "}
                          {kgToDisplay(
                            entry.volumeKg,
                            profile.weight_unit
                          ).toLocaleString(undefined, {
                            maximumFractionDigits: 0,
                          })}{" "}
                          {profile.weight_unit}
                        </>
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {format(new Date(`${entry.log_date}T00:00:00`), "EEE d MMM")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

    </div>
  );
}
