"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { awardXp } from "@/lib/gamification";
import { WEEK_HOURS } from "@/lib/constants";

const TASK_CATEGORY = z.enum([
  "strong_signal",
  "weak_signal",
  "strong_noise",
  "weak_noise",
  "personal",
]);

const taskInputSchema = z.object({
  name: z.string().trim().min(1, "Task name is required").max(120),
  category: TASK_CATEGORY,
  target_hours: z.coerce.number().min(0).max(168),
  is_recurring: z.boolean().default(false),
});

const createSprintSchema = z
  .object({
    week_start_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Week start must be a date"),
    notes: z.string().trim().max(1000).optional().nullable(),
    tasks: z.array(taskInputSchema).min(1, "Add at least one task").max(50),
  })
  .refine(
    (data) =>
      data.tasks.reduce((sum, task) => sum + task.target_hours, 0) <= WEEK_HOURS,
    {
      message: `Planned hours exceed the ${WEEK_HOURS}h available in a week`,
      path: ["tasks"],
    }
  );

export type CreateSprintInput = z.infer<typeof createSprintSchema>;

export type ActionResult =
  | { ok: true; sprintId: string }
  | { ok: false; error: string };

export async function createSprintWithTasks(
  input: CreateSprintInput
): Promise<ActionResult> {
  const parsed = createSprintSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not authenticated" };
  }

  const { data: sprint, error: sprintError } = await supabase
    .from("sprints")
    .insert({
      owner_id: user.id,
      week_start_date: parsed.data.week_start_date,
      notes: parsed.data.notes ?? null,
    })
    .select("id")
    .single();

  if (sprintError || !sprint) {
    if (sprintError?.code === "23505") {
      return {
        ok: false,
        error: "A sprint already exists for that week. Pick a different week.",
      };
    }
    return { ok: false, error: sprintError?.message ?? "Failed to create sprint" };
  }

  const taskRows = parsed.data.tasks.map((task, index) => ({
    sprint_id: sprint.id,
    owner_id: user.id,
    name: task.name,
    category: task.category,
    target_hours: task.target_hours,
    is_recurring: task.is_recurring,
    position: index,
  }));

  const { error: tasksError } = await supabase.from("tasks").insert(taskRows);

  if (tasksError) {
    // Best-effort rollback so we don't leave an empty sprint behind.
    await supabase.from("sprints").delete().eq("id", sprint.id);
    return { ok: false, error: tasksError.message };
  }

  await awardXp(supabase, user.id, "sprint_created", sprint.id);

  revalidatePath("/sprint/setup");
  revalidatePath("/dashboard");
  return { ok: true, sprintId: sprint.id };
}

export async function deleteSprint(sprintId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { error } = await supabase
    .from("sprints")
    .delete()
    .eq("id", sprintId)
    .eq("owner_id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/sprint/setup");
  revalidatePath("/dashboard");
  return { ok: true, sprintId };
}

export async function goToSprint(sprintId: string) {
  redirect(`/sprint/${sprintId}`);
}

/**
 * Copy all tasks from an existing sprint into a brand-new sprint for
 * `newWeekStart`. Used by the "Use as template" rollover button.
 */
export async function rolloverSprint(
  templateSprintId: string,
  newWeekStart: string
): Promise<ActionResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newWeekStart)) {
    return { ok: false, error: "Invalid week start date." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  // Load template tasks (must belong to this user).
  const { data: templateTasks, error: taskLoadErr } = await supabase
    .from("tasks")
    .select("name, category, target_hours, is_recurring, position")
    .eq("sprint_id", templateSprintId)
    .eq("owner_id", user.id)
    .order("position", { ascending: true });

  if (taskLoadErr) return { ok: false, error: taskLoadErr.message };
  if (!templateTasks || templateTasks.length === 0) {
    return { ok: false, error: "The template sprint has no tasks to copy." };
  }

  // Create the new sprint.
  const { data: newSprint, error: sprintErr } = await supabase
    .from("sprints")
    .insert({ owner_id: user.id, week_start_date: newWeekStart })
    .select("id")
    .single();

  if (sprintErr || !newSprint) {
    if (sprintErr?.code === "23505") {
      return {
        ok: false,
        error: `A sprint already exists for the week of ${newWeekStart}.`,
      };
    }
    return { ok: false, error: sprintErr?.message ?? "Failed to create sprint" };
  }

  // Copy tasks into the new sprint.
  const { error: insertErr } = await supabase.from("tasks").insert(
    templateTasks.map((t, i) => ({
      sprint_id: newSprint.id,
      owner_id: user.id,
      name: t.name,
      category: t.category,
      target_hours: t.target_hours,
      is_recurring: t.is_recurring,
      position: i,
    }))
  );

  if (insertErr) {
    await supabase.from("sprints").delete().eq("id", newSprint.id);
    return { ok: false, error: insertErr.message };
  }

  revalidatePath("/sprint/setup");
  revalidatePath("/dashboard");
  return { ok: true, sprintId: newSprint.id };
}
