"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { WEEK_HOURS } from "@/lib/constants";

const TASK_CATEGORY = z.enum([
  "strong_signal",
  "weak_signal",
  "strong_noise",
  "weak_noise",
  "personal",
]);

const updateTaskSchema = z.object({
  taskId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  category: TASK_CATEGORY,
  target_hours: z.coerce.number().min(0).max(168),
  is_recurring: z.boolean(),
});

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export type ActionResult = { ok: true } | { ok: false; error: string };

async function getUserOrFail() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

export async function updateTask(input: UpdateTaskInput): Promise<ActionResult> {
  const parsed = updateTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  // The new target must fit within the week alongside the sprint's other tasks.
  const { data: task, error: taskError } = await ctx.supabase
    .from("tasks")
    .select("sprint_id")
    .eq("id", parsed.data.taskId)
    .eq("owner_id", ctx.user.id)
    .maybeSingle();

  if (taskError) return { ok: false, error: taskError.message };
  if (!task) return { ok: false, error: "Task not found" };

  const { data: siblings, error: siblingsError } = await ctx.supabase
    .from("tasks")
    .select("id, target_hours")
    .eq("sprint_id", task.sprint_id)
    .eq("owner_id", ctx.user.id);

  if (siblingsError) return { ok: false, error: siblingsError.message };

  const otherHours = (siblings ?? [])
    .filter((t) => t.id !== parsed.data.taskId)
    .reduce((sum, t) => sum + Number(t.target_hours || 0), 0);

  if (otherHours + parsed.data.target_hours > WEEK_HOURS) {
    return {
      ok: false,
      error: `That target would put the sprint at ${otherHours + parsed.data.target_hours}h — the week only has ${WEEK_HOURS}h.`,
    };
  }

  const { error } = await ctx.supabase
    .from("tasks")
    .update({
      name: parsed.data.name,
      category: parsed.data.category,
      target_hours: parsed.data.target_hours,
      is_recurring: parsed.data.is_recurring,
    })
    .eq("id", parsed.data.taskId)
    .eq("owner_id", ctx.user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/sprint/[id]`, "page");
  revalidatePath("/dashboard");
  return { ok: true };
}

const addTaskSchema = z.object({
  sprintId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  category: TASK_CATEGORY,
  target_hours: z.coerce.number().min(0).max(168),
  is_recurring: z.boolean().default(false),
});

export async function addTaskToSprint(
  input: z.infer<typeof addTaskSchema>
): Promise<ActionResult> {
  const parsed = addTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  // Confirm the sprint belongs to the user (RLS would block otherwise, but
  // we want a friendly error), get the position, and check week capacity.
  const { data: existing, error: existingError } = await ctx.supabase
    .from("tasks")
    .select("id, target_hours")
    .eq("sprint_id", parsed.data.sprintId)
    .eq("owner_id", ctx.user.id);

  if (existingError) return { ok: false, error: existingError.message };

  const plannedHours = (existing ?? []).reduce(
    (sum, t) => sum + Number(t.target_hours || 0),
    0
  );

  if (plannedHours + parsed.data.target_hours > WEEK_HOURS) {
    return {
      ok: false,
      error: `That task would put the sprint at ${plannedHours + parsed.data.target_hours}h — the week only has ${WEEK_HOURS}h.`,
    };
  }

  const { error } = await ctx.supabase.from("tasks").insert({
    sprint_id: parsed.data.sprintId,
    owner_id: ctx.user.id,
    name: parsed.data.name,
    category: parsed.data.category,
    target_hours: parsed.data.target_hours,
    is_recurring: parsed.data.is_recurring,
    position: existing?.length ?? 0,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/sprint/[id]`, "page");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteTask(taskId: string): Promise<ActionResult> {
  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { error } = await ctx.supabase
    .from("tasks")
    .delete()
    .eq("id", taskId)
    .eq("owner_id", ctx.user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/sprint/[id]`, "page");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteSprintAndRedirect(sprintId: string) {
  const ctx = await getUserOrFail();
  if (!ctx) return;

  await ctx.supabase
    .from("sprints")
    .delete()
    .eq("id", sprintId)
    .eq("owner_id", ctx.user.id);

  revalidatePath("/sprint/setup");
  revalidatePath("/dashboard");
  redirect("/sprint/setup");
}
