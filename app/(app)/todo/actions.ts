"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

async function getUserOrFail() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

const createSectionSchema = z.object({
  name: z.string().trim().min(1).max(100),
  parentId: z.string().uuid().nullable().optional(),
});

export async function createSection(
  input: z.infer<typeof createSectionSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = createSectionSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const parentId = parsed.data.parentId ?? null;

  // count siblings to set position
  let query = ctx.supabase
    .from("todo_sections")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", ctx.user.id);

  if (parentId === null) {
    query = query.is("parent_id", null);
  } else {
    query = query.eq("parent_id", parentId);
  }

  const { count } = await query;

  const { data, error } = await ctx.supabase
    .from("todo_sections")
    .insert({
      owner_id: ctx.user.id,
      parent_id: parentId,
      name: parsed.data.name,
      position: count ?? 0,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Failed to create section" };

  revalidatePath("/todo");
  return { ok: true, data: { id: data.id } };
}

const updateSectionSchema = z.object({
  sectionId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
});

export async function updateSection(
  input: z.infer<typeof updateSectionSchema>
): Promise<ActionResult> {
  const parsed = updateSectionSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { error } = await ctx.supabase
    .from("todo_sections")
    .update({ name: parsed.data.name })
    .eq("id", parsed.data.sectionId)
    .eq("owner_id", ctx.user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/todo");
  return { ok: true };
}

export async function deleteSection(sectionId: string): Promise<ActionResult> {
  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { error } = await ctx.supabase
    .from("todo_sections")
    .delete()
    .eq("id", sectionId)
    .eq("owner_id", ctx.user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/todo");
  return { ok: true };
}

export async function toggleSectionCollapse(sectionId: string): Promise<ActionResult> {
  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { data: section, error: fetchError } = await ctx.supabase
    .from("todo_sections")
    .select("is_collapsed")
    .eq("id", sectionId)
    .eq("owner_id", ctx.user.id)
    .single();

  if (fetchError || !section) return { ok: false, error: fetchError?.message ?? "Section not found" };

  const { error } = await ctx.supabase
    .from("todo_sections")
    .update({ is_collapsed: !section.is_collapsed })
    .eq("id", sectionId)
    .eq("owner_id", ctx.user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/todo");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

const createTaskSchema = z.object({
  sectionId: z.string().uuid(),
  title: z.string().trim().min(1).max(500),
});

export async function createTask(
  input: z.infer<typeof createTaskSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = createTaskSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { count } = await ctx.supabase
    .from("todo_tasks")
    .select("*", { count: "exact", head: true })
    .eq("section_id", parsed.data.sectionId)
    .eq("owner_id", ctx.user.id);

  const { data, error } = await ctx.supabase
    .from("todo_tasks")
    .insert({
      owner_id: ctx.user.id,
      section_id: parsed.data.sectionId,
      title: parsed.data.title,
      position: count ?? 0,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Failed to create task" };

  revalidatePath("/todo");
  return { ok: true, data: { id: data.id } };
}

const updateTaskSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().trim().max(2000).optional(),
});

export async function updateTask(
  input: z.infer<typeof updateTaskSchema>
): Promise<ActionResult> {
  const parsed = updateTaskSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const updates: { title?: string; description?: string | null } = {};
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.description !== undefined)
    updates.description = parsed.data.description || null;

  const { error } = await ctx.supabase
    .from("todo_tasks")
    .update(updates)
    .eq("id", parsed.data.taskId)
    .eq("owner_id", ctx.user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/todo");
  return { ok: true };
}

export async function deleteTask(taskId: string): Promise<ActionResult> {
  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { error } = await ctx.supabase
    .from("todo_tasks")
    .delete()
    .eq("id", taskId)
    .eq("owner_id", ctx.user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/todo");
  return { ok: true };
}

const toggleTaskSchema = z.object({
  taskId: z.string().uuid(),
  isCompleted: z.boolean(),
});

export async function toggleTaskComplete(
  input: z.infer<typeof toggleTaskSchema>
): Promise<ActionResult> {
  const parsed = toggleTaskSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await getUserOrFail();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { error } = await ctx.supabase
    .from("todo_tasks")
    .update({
      is_completed: parsed.data.isCompleted,
      completed_at: parsed.data.isCompleted ? new Date().toISOString() : null,
    })
    .eq("id", parsed.data.taskId)
    .eq("owner_id", ctx.user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/todo");
  return { ok: true };
}
