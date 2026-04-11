"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { TASK_CATEGORIES, type TaskCategory } from "@/lib/constants";
import { createSprintWithTasks } from "./actions";

type FormValues = {
  week_start_date: string;
  notes: string;
  tasks: {
    name: string;
    category: TaskCategory;
    target_hours: number;
    is_recurring: boolean;
  }[];
};

const EMPTY_TASK: FormValues["tasks"][number] = {
  name: "",
  category: "strong_signal",
  target_hours: 0,
  is_recurring: false,
};

export function CreateSprintForm({ defaultWeekStart }: { defaultWeekStart: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const { register, control, handleSubmit, formState, reset } = useForm<FormValues>({
    defaultValues: {
      week_start_date: defaultWeekStart,
      notes: "",
      tasks: [{ ...EMPTY_TASK }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "tasks" });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await createSprintWithTasks(values);
      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      reset({
        week_start_date: defaultWeekStart,
        notes: "",
        tasks: [{ ...EMPTY_TASK }],
      });
      router.push(`/sprint/${result.sprintId}`);
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="week_start_date"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            Week starting (Monday)
          </label>
          <input
            id="week_start_date"
            type="date"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            {...register("week_start_date", { required: true })}
          />
        </div>
        <div>
          <label
            htmlFor="notes"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            Notes <span className="text-muted-foreground">(optional)</span>
          </label>
          <input
            id="notes"
            type="text"
            placeholder="Theme of the week…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            {...register("notes")}
          />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Tasks</h3>
          <button
            type="button"
            onClick={() => append({ ...EMPTY_TASK })}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1 text-xs font-medium text-foreground hover:bg-accent"
          >
            <Plus className="h-3 w-3" />
            Add task
          </button>
        </div>
        <div className="space-y-2">
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="grid gap-2 rounded-md border border-border bg-background p-3 lg:grid-cols-[2fr_1.2fr_0.8fr_auto_auto]"
            >
              <input
                type="text"
                placeholder="Task name"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                {...register(`tasks.${index}.name`, { required: true })}
              />
              <select
                className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                {...register(`tasks.${index}.category`)}
              >
                {(Object.entries(TASK_CATEGORIES) as [TaskCategory, typeof TASK_CATEGORIES[TaskCategory]][]).map(
                  ([value, meta]) => (
                    <option key={value} value={value}>
                      {meta.label}
                    </option>
                  )
                )}
              </select>
              <input
                type="number"
                step="0.5"
                min="0"
                placeholder="Target hrs"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                {...register(`tasks.${index}.target_hours`, { valueAsNumber: true })}
              />
              <label className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input"
                  {...register(`tasks.${index}.is_recurring`)}
                />
                Recurring
              </label>
              <button
                type="button"
                onClick={() => fields.length > 1 && remove(index)}
                disabled={fields.length === 1}
                className="inline-flex items-center justify-center rounded-md px-2 text-muted-foreground hover:text-destructive disabled:opacity-30"
                aria-label={`Remove task ${index + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {serverError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {serverError}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || formState.isSubmitting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create sprint"}
        </button>
      </div>
    </form>
  );
}
