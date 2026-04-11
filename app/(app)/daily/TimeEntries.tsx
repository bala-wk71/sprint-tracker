"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CategoryBadge } from "@/components/sprint/CategoryBadge";
import type { TaskCategory } from "@/lib/constants";
import { addTimeEntry, deleteTimeEntry, updateTimeEntry } from "./actions";

export type SprintTaskOption = {
  id: string;
  name: string;
  category: TaskCategory;
};

export type DisplayTimeEntry = {
  id: string;
  task_id: string | null;
  task_name: string | null;
  task_category: TaskCategory | null;
  start_time: string | null;
  duration_hours: number;
  energy_during: number | null;
  notes: string;
  is_private: boolean;
};

type DraftEntry = {
  task_id: string | null;
  start_time: string;
  duration_hours: number;
  energy_during: number;
  notes: string;
  is_private: boolean;
};

const EMPTY_DRAFT: DraftEntry = {
  task_id: null,
  start_time: "",
  duration_hours: 0.5,
  energy_during: 3,
  notes: "",
  is_private: false,
};

export function TimeEntries({
  date,
  tasks,
  initialEntries,
}: {
  date: string;
  tasks: SprintTaskOption[];
  initialEntries: DisplayTimeEntry[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftEntry>({ ...EMPTY_DRAFT });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DraftEntry | null>(null);

  const totalHours = initialEntries.reduce((sum, e) => sum + e.duration_hours, 0);

  const handleAdd = () => {
    if (draft.duration_hours <= 0) {
      setError("Duration must be greater than 0");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addTimeEntry({
        date,
        task_id: draft.task_id,
        start_time: draft.start_time || null,
        duration_hours: draft.duration_hours,
        energy_during: draft.energy_during,
        notes: draft.notes,
        is_private: draft.is_private,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraft({ ...EMPTY_DRAFT });
      router.refresh();
    });
  };

  const beginEdit = (entry: DisplayTimeEntry) => {
    setEditingId(entry.id);
    setEditDraft({
      task_id: entry.task_id,
      start_time: entry.start_time ?? "",
      duration_hours: entry.duration_hours,
      energy_during: entry.energy_during ?? 3,
      notes: entry.notes,
      is_private: entry.is_private,
    });
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const saveEdit = () => {
    if (!editDraft || !editingId) return;
    setError(null);
    startTransition(async () => {
      const result = await updateTimeEntry({
        id: editingId,
        date,
        task_id: editDraft.task_id,
        start_time: editDraft.start_time || null,
        duration_hours: editDraft.duration_hours,
        energy_during: editDraft.energy_during,
        notes: editDraft.notes,
        is_private: editDraft.is_private,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      cancelEdit();
      router.refresh();
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this time entry?")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteTimeEntry(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const renderEntryEditor = (
    current: DraftEntry,
    setCurrent: (next: DraftEntry) => void,
    onSave: () => void,
    onCancel?: () => void,
    submitLabel = "Add entry"
  ) => (
    <div className="space-y-3 rounded-md border border-border bg-background p-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <select
          value={current.task_id ?? ""}
          onChange={(e) =>
            setCurrent({ ...current, task_id: e.target.value || null })
          }
          className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">— No task —</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input
          type="time"
          value={current.start_time}
          onChange={(e) => setCurrent({ ...current, start_time: e.target.value })}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          type="number"
          min="0.25"
          step="0.25"
          value={current.duration_hours}
          onChange={(e) =>
            setCurrent({ ...current, duration_hours: Number(e.target.value) })
          }
          placeholder="Hours"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div>
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Energy {current.energy_during}/5
          </label>
          <input
            type="range"
            min="1"
            max="5"
            step="1"
            value={current.energy_during}
            onChange={(e) =>
              setCurrent({ ...current, energy_during: Number(e.target.value) })
            }
            className="w-full accent-primary"
          />
        </div>
      </div>
      <textarea
        value={current.notes}
        onChange={(e) => setCurrent({ ...current, notes: e.target.value })}
        rows={2}
        placeholder="What did you work on? (optional)"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={current.is_private}
            onChange={(e) =>
              setCurrent({ ...current, is_private: e.target.checked })
            }
            className="h-4 w-4 rounded border-input"
          />
          Private (hidden from reviewers)
        </label>
        <div className="flex gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={pending}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={pending}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {pending ? "Saving…" : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Today's entries{" "}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {initialEntries.length} {initialEntries.length === 1 ? "entry" : "entries"}
          </span>
        </h3>
        <span className="text-sm font-semibold text-primary">
          {totalHours.toFixed(2)}h logged
        </span>
      </div>

      {tasks.length === 0 && (
        <p className="rounded-md border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-600 dark:text-yellow-400">
          No sprint set up for this week — entries can still be logged without a task.
        </p>
      )}

      {initialEntries.length > 0 && (
        <ul className="space-y-2">
          {initialEntries.map((entry) =>
            editingId === entry.id && editDraft ? (
              <li key={entry.id}>
                {renderEntryEditor(
                  editDraft,
                  setEditDraft,
                  saveEdit,
                  cancelEdit,
                  "Save"
                )}
              </li>
            ) : (
              <li
                key={entry.id}
                className="rounded-md border border-border bg-background p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {entry.task_name ? (
                        <span className="text-sm font-medium text-foreground">
                          {entry.task_name}
                        </span>
                      ) : (
                        <span className="text-sm italic text-muted-foreground">
                          (no task)
                        </span>
                      )}
                      {entry.task_category && (
                        <CategoryBadge category={entry.task_category} />
                      )}
                      {entry.is_private && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          Private
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {entry.start_time && (
                        <span>{entry.start_time.slice(0, 5)}</span>
                      )}
                      <span>{entry.duration_hours}h</span>
                      {entry.energy_during !== null && (
                        <span>energy {entry.energy_during}/5</span>
                      )}
                    </div>
                    {entry.notes && (
                      <p className="mt-1 text-xs text-muted-foreground">{entry.notes}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => beginEdit(entry)}
                      className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(entry.id)}
                      disabled={pending}
                      className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            )
          )}
        </ul>
      )}

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Add new entry
        </p>
        {renderEntryEditor(draft, setDraft, handleAdd)}
      </div>
    </div>
  );
}
