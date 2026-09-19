"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { GOAL_AREAS, goalArea, type GoalArea } from "@/lib/goals/constants";
import { FIELD_HINT, FIELD_LABEL, INPUT, PillGroup } from "@/components/goals/GoalFormParts";
import { archiveStream, saveStream } from "@/app/(app)/goals/plan-actions";

export type EditableStream = { id: string; name: string; area: GoalArea; weeklyHours: number | null; weight: number };

/** Starting points drawn from real plans; each is one tap to add, then editable. */
const SUGGESTIONS: { name: string; area: GoalArea }[] = [
  { name: "Day job", area: "work" },
  { name: "Family business", area: "work" },
  { name: "Startup", area: "work" },
  { name: "Health", area: "health" },
  { name: "Money", area: "money" },
  { name: "Family & home", area: "people" },
  { name: "Learning", area: "learning" },
  { name: "Daily life", area: "self" },
];

export function StreamManager({ streams }: { streams: EditableStream[] }) {
  const [editing, setEditing] = useState<string | "new" | null>(streams.length ? null : "new");
  const taken = new Set(streams.map((s) => s.name.toLowerCase()));
  const totalHours = streams.reduce((sum, s) => sum + (s.weeklyHours ?? 0), 0);

  return (
    <div className="space-y-4">
      {streams.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {streams.map((s) =>
            editing === s.id ? (
              <li key={s.id} className="p-4">
                <StreamForm stream={s} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <StreamRow key={s.id} stream={s} onEdit={() => setEditing(s.id)} />
            )
          )}
        </ul>
      )}
      {totalHours > 0 && (
        <p className={cn("text-xs", totalHours > 112 ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
          {totalHours}h a week planned across streams
          {totalHours > 112 ? ", more than the waking hours in a week. Something has to give." : "."}
        </p>
      )}

      {editing === "new" ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <StreamForm onDone={() => setEditing(null)} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Add a stream
        </button>
      )}

      {SUGGESTIONS.some((s) => !taken.has(s.name.toLowerCase())) && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Or start from one of these:</p>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.filter((s) => !taken.has(s.name.toLowerCase())).map((s) => (
              <QuickAdd key={s.name} name={s.name} area={s.area} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StreamRow({ stream, onEdit }: { stream: EditableStream; onEdit: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const area = goalArea(stream.area);
  return (
    <li className="flex items-center gap-3 p-4">
      <span className={cn("h-2 w-2 shrink-0 rounded-full", area.dot)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{stream.name}</p>
        <p className="text-xs text-muted-foreground">
          {area.label}
          {stream.weeklyHours !== null ? ` · ${stream.weeklyHours}h a week` : ""}
        </p>
      </div>
      <button type="button" onClick={onEdit} aria-label={`Edit ${stream.name}`} className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        disabled={pending}
        aria-label={`Archive ${stream.name}`}
        onClick={() =>
          window.confirm(`Archive "${stream.name}"? Its goals stay; they just leave the stream.`) &&
          startTransition(async () => {
            await archiveStream(stream.id);
            router.refresh();
          })
        }
        className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-50"
      >
        <Archive className="h-4 w-4" />
      </button>
    </li>
  );
}

function QuickAdd({ name, area }: { name: string; area: GoalArea }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await saveStream({ name, area, weeklyHours: null, weight: 1 });
          router.refresh();
        })
      }
      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
    >
      <span className={cn("h-2 w-2 rounded-full", goalArea(area).dot)} aria-hidden />
      {name}
    </button>
  );
}

function StreamForm({ stream, onDone }: { stream?: EditableStream; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(stream?.name ?? "");
  const [area, setArea] = useState<GoalArea | null>(stream?.area ?? null);
  const [hours, setHours] = useState(stream?.weeklyHours?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!area) return setError("Pick the life area it belongs to.");
    const weeklyHours = hours.trim() === "" ? null : Number(hours);
    if (weeklyHours !== null && (!Number.isFinite(weeklyHours) || weeklyHours < 0)) return setError("Hours should be a number.");
    setError(null);
    startTransition(async () => {
      const result = await saveStream({ id: stream?.id, name, area, weeklyHours, weight: stream?.weight ?? 1 });
      if (!result.ok) return setError(result.error);
      onDone();
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <div>
          <label htmlFor="stream_name" className={FIELD_LABEL}>Name</label>
          <input id="stream_name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Dad's company" className={INPUT} />
        </div>
        <div>
          <label htmlFor="stream_hours" className={FIELD_LABEL}>Hours a week</label>
          <input id="stream_hours" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Optional" className={INPUT} />
        </div>
      </div>
      <p className={cn(FIELD_HINT, "-mt-2")}>Planned hours are compared with time logged on this stream&apos;s linked tasks.</p>
      <PillGroup label="Life area" value={area} options={GOAL_AREAS} onChange={setArea} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {pending ? "Saving…" : stream ? "Save" : "Add stream"}
        </button>
        <button type="button" onClick={onDone} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
      </div>
    </form>
  );
}
