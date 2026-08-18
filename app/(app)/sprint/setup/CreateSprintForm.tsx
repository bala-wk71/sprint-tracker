"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { WEEK_HOURS, type TaskCategory } from "@/lib/constants";
import {
  weekEndIsoOf,
  weekStartDayName,
  weekStartIsoOf,
  type WeekStartDay,
} from "@/lib/week";
import { CategoryPicker } from "@/components/sprint/CategoryPicker";
import { WeekCapacityBar } from "@/components/sprint/WeekCapacityBar";
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

function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

const EMPTY_TASK: FormValues["tasks"][number] = {
  name: "",
  category: "strong_signal",
  target_hours: 0,
  is_recurring: false,
};

export function CreateSprintForm({
  defaultWeekStart,
  weekStartDay,
}: {
  defaultWeekStart: string;
  /** The day the user's sprint week begins — the picker snaps to it. */
  weekStartDay: WeekStartDay;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const { register, control, handleSubmit, formState, reset, setValue } =
    useForm<FormValues>({
      defaultValues: {
        week_start_date: defaultWeekStart,
        notes: "",
        tasks: [{ ...EMPTY_TASK }],
      },
    });

  const { fields, append, remove } = useFieldArray({ control, name: "tasks" });

  const weekStart =
    useWatch({ control, name: "week_start_date" }) || defaultWeekStart;
  const watchedTasks = useWatch({ control, name: "tasks" });
  const plannedHours = (watchedTasks ?? []).reduce(
    (sum, task) => sum + (Number(task?.target_hours) || 0),
    0
  );
  const overCapacity = plannedHours > WEEK_HOURS;

  const onSubmit = handleSubmit((values) => {
    if (overCapacity) {
      setServerError(
        `You've planned ${plannedHours}h but the week only has ${WEEK_HOURS}h. Trim some targets first.`
      );
      return;
    }
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
            Week starting ({weekStartDayName(weekStartDay)})
          </label>
          {/* Sprints are keyed by the first day of the week, so any date the
              user picks snaps back to that day rather than being rejected. */}
          <input
            id="week_start_date"
            type="date"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            {...register("week_start_date", {
              required: true,
              onChange: (e) => {
                const value = e.target.value;
                if (!value) return;
                setValue("week_start_date", weekStartIsoOf(value, weekStartDay), {
                  shouldValidate: true,
                });
              },
            })}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {weekStart ? (
              <>
                Covers {formatDay(weekStart)} – {formatDay(weekEndIsoOf(weekStart))}.
              </>
            ) : (
              <>Pick any day in the week you want to plan.</>
            )}{" "}
            Change the first day in{" "}
            <Link href="/settings" className="text-primary hover:underline">
              Settings
            </Link>
            .
          </p>
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
        <WeekCapacityBar plannedHours={plannedHours} className="mb-2" />
        <div className="space-y-2">
          {fields.map((field, index) => (
            // The category no longer shares a row with the name and hours: a
            // 2x2 does not fit a 1.2fr column, and squeezing it back into a
            // dropdown is what made the choice a guess in the first place.
            <div
              key={field.id}
              className="space-y-2 rounded-md border border-border bg-background p-3"
            >
              <div className="grid gap-2 sm:grid-cols-[2fr_0.8fr_auto_auto]">
                <input
                  type="text"
                  placeholder="Task name"
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  {...register(`tasks.${index}.name`, { required: true })}
                />
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

              <Controller
                control={control}
                name={`tasks.${index}.category`}
                render={({ field: categoryField }) => (
                  <CategoryPicker
                    value={categoryField.value as TaskCategory}
                    onChange={categoryField.onChange}
                  />
                )}
              />
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
          disabled={pending || formState.isSubmitting || overCapacity}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create sprint"}
        </button>
        {overCapacity && (
          <p className="text-xs text-destructive">
            Planned hours exceed the {WEEK_HOURS}h available in a week.
          </p>
        )}
      </div>
    </form>
  );
}
