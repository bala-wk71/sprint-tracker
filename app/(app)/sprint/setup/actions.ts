"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

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

const createSprintSchema = z.object({
  week_start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Week start must be a date"),
  notes: z.string().trim().max(1000).optional().nullable(),
  tasks: z.array(taskInputSchema).min(1, "Add at least one task").max(50),
});

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
