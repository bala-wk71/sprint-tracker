"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { CheckCircle2, FileUp, TriangleAlert, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_CSV_BYTES } from "@/lib/health/constants";
import {
  importFitdays,
  importFitnotes,
  previewFitdays,
  previewFitnotes,
  type FitdaysPreview,
  type FitnotesPreview,
} from "./actions";

type Source = "fitnotes" | "fitdays";

const CARD = "rounded-xl border border-border bg-card p-4 sm:p-6";

export function ImportPanel() {
  const router = useRouter();
  const [source, setSource] = useState<Source>("fitnotes");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [workoutPreview, setWorkoutPreview] = useState<FitnotesPreview | null>(null);
  const [bodyPreview, setBodyPreview] = useState<FitdaysPreview | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setWorkoutPreview(null);
    setBodyPreview(null);
    setDone(null);
    setError(null);
  };

  const readFile = async (file: File) => {
    reset();
    if (file.size > MAX_CSV_BYTES) {
      setError(
        `That file is ${(file.size / 1_000_000).toFixed(1)}MB — the limit is ${
          MAX_CSV_BYTES / 1_000_000
        }MB. Export a narrower date range and import it in parts.`
      );
      return;
    }
    // Read in the browser rather than uploading: the file only needs to become
    // text, and this keeps the whole feature free of storage plumbing.
    const content = await file.text();
    setFileName(file.name);
    setText(content);
    preview(content);
  };

  const preview = (content: string) => {
    reset();
    startTransition(async () => {
      if (source === "fitnotes") {
        const result = await previewFitnotes(content);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setWorkoutPreview(result.data);
      } else {
        const result = await previewFitdays(content);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setBodyPreview(result.data);
      }
    });
  };

  const commit = () => {
    setError(null);
    startTransition(async () => {
      if (source === "fitnotes") {
        const result = await importFitnotes(text);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const d = result.data;
        setDone(
          `${d.workoutsCreated} session${d.workoutsCreated === 1 ? "" : "s"} and ${d.setsCreated} set${
            d.setsCreated === 1 ? "" : "s"
          } imported.` +
            (d.exercisesCreated > 0
              ? ` ${d.exercisesCreated} new exercise${d.exercisesCreated === 1 ? "" : "s"} added to your library.`
              : "") +
            (d.datesSkipped > 0
              ? ` ${d.datesSkipped} date${d.datesSkipped === 1 ? "" : "s"} already had a session and were left alone.`
              : "")
        );
      } else {
        const result = await importFitdays(text);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setDone(`${result.data.rowsWritten} daily readings imported.`);
      }
      setWorkoutPreview(null);
      setBodyPreview(null);
      setText("");
      setFileName(null);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div className={CARD}>
        <h2 className="text-sm font-semibold text-foreground">
          Bring your history across
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Export a CSV from the app and drop it in. Importing the same file
          twice is safe — days that already have data are left alone.
        </p>

        <div className="mt-4 flex items-center gap-1 rounded-lg border border-border bg-background p-1 sm:w-fit">
          {(
            [
              { id: "fitnotes", label: "FitNotes — workouts" },
              { id: "fitdays", label: "FitDays — body" },
            ] as const
          ).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setSource(s.id);
                reset();
                setText("");
                setFileName(null);
                if (fileRef.current) fileRef.current.value = "";
              }}
              className={cn(
                "flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none",
                source === s.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <label
            htmlFor="csv_file"
            className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border py-6 text-sm font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground"
          >
            <FileUp className="h-4 w-4" />
            {fileName ?? "Choose a .csv file"}
          </label>
          <input
            ref={fileRef}
            id="csv_file"
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void readFile(file);
            }}
          />

          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Or paste the CSV text
            </summary>
            <textarea
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Date,Exercise,Category,…"
              className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="button"
              disabled={pending || text.trim().length < 10}
              onClick={() => preview(text)}
              className="mt-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
            >
              Check it
            </button>
          </details>
        </div>

        {pending && (
          <p className="mt-3 text-sm text-muted-foreground">Reading…</p>
        )}

        {error && (
          <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {done && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--progress-good))]" />
            <span>{done}</span>
          </div>
        )}
      </div>

      {/* Nothing is written until the user has seen what was understood. */}
      {workoutPreview && !pending && (
        <div className={CARD}>
          <h3 className="text-sm font-semibold text-foreground">
            What this file contains
          </h3>

          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            <Stat label="Sessions" value={workoutPreview.workoutCount} />
            <Stat label="Sets" value={workoutPreview.setCount} />
            <Stat label="Exercises" value={workoutPreview.exerciseCount} />
          </dl>

          {workoutPreview.dateRange && (
            <p className="mt-3 text-xs text-muted-foreground">
              {format(
                new Date(`${workoutPreview.dateRange.from}T00:00:00`),
                "d MMM yyyy"
              )}{" "}
              to{" "}
              {format(
                new Date(`${workoutPreview.dateRange.to}T00:00:00`),
                "d MMM yyyy"
              )}
            </p>
          )}

          {workoutPreview.newExerciseNames.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {workoutPreview.newExerciseNames.length} new exercise
                {workoutPreview.newExerciseNames.length === 1 ? "" : "s"}
              </span>{" "}
              will be added to your library:{" "}
              {workoutPreview.newExerciseNames.slice(0, 8).join(", ")}
              {workoutPreview.newExerciseNames.length > 8 && "…"}
            </p>
          )}

          {workoutPreview.alreadyImportedDates > 0 && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-[hsl(var(--progress-warning))]">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {workoutPreview.alreadyImportedDates} date
              {workoutPreview.alreadyImportedDates === 1 ? "" : "s"} already have
              a session logged and will be skipped.
            </p>
          )}

          <Warnings warnings={workoutPreview.warnings} />

          <ImportButton
            disabled={
              pending ||
              workoutPreview.workoutCount -
                workoutPreview.alreadyImportedDates ===
                0
            }
            onClick={commit}
            label={`Import ${workoutPreview.workoutCount - workoutPreview.alreadyImportedDates} session${
              workoutPreview.workoutCount - workoutPreview.alreadyImportedDates === 1
                ? ""
                : "s"
            }`}
          />
        </div>
      )}

      {bodyPreview && !pending && (
        <div className={CARD}>
          <h3 className="text-sm font-semibold text-foreground">
            What matched
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            FitDays names its columns differently depending on the app version
            and phone language, so check these before importing.
          </p>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[380px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Column in your file</th>
                  <th className="py-2 font-medium">Stored as</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="py-2 pr-3 font-mono text-xs text-foreground">
                    {bodyPreview.dateHeader ?? "— none found —"}
                  </td>
                  <td className="py-2 text-muted-foreground">Date</td>
                </tr>
                {bodyPreview.mapping.map((m) => (
                  <tr key={m.field} className="border-b border-border">
                    <td className="py-2 pr-3 font-mono text-xs text-foreground">
                      {m.header}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {m.label}
                      {m.convertedFromLbs && (
                        <span className="ml-1 text-xs">(lbs → kg)</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {bodyPreview.unmatchedHeaders.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Ignored: {bodyPreview.unmatchedHeaders.join(", ")}
            </p>
          )}

          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <Stat label="Daily readings" value={bodyPreview.rowCount} />
            <Stat
              label="Already have a reading"
              value={bodyPreview.existingDates}
            />
          </dl>

          {bodyPreview.existingDates > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Those days will be updated with the values from this file.
            </p>
          )}

          <Warnings warnings={bodyPreview.warnings} />

          <ImportButton
            disabled={
              pending ||
              bodyPreview.rowCount === 0 ||
              bodyPreview.mapping.length === 0
            }
            onClick={commit}
            label={`Import ${bodyPreview.rowCount} reading${bodyPreview.rowCount === 1 ? "" : "s"}`}
          />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-xl font-bold text-foreground">
        {value.toLocaleString()}
      </dd>
    </div>
  );
}

function Warnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1">
      {warnings.map((w) => (
        <li
          key={w}
          className="flex items-start gap-1.5 text-xs text-[hsl(var(--progress-warning))]"
        >
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {w}
        </li>
      ))}
    </ul>
  );
}

function ImportButton({
  disabled,
  onClick,
  label,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="mt-4 flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
    >
      <Upload className="h-4 w-4" />
      {label}
    </button>
  );
}
