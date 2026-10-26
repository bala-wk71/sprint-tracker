"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { todayIsoLocal } from "@/lib/dates";
import { currentPhaseOf, draftPhaseGoals, loadPhases, nextPhaseOf, phaseLabel } from "@/lib/planning/phases";

export type PhaseResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.");
const SIGNED_OUT = "You're signed out. Sign in and try again.";

async function ctxOrNull() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, userId: user.id } : null;
}

function revalidatePhases() {
  revalidatePath("/goals", "layout");
  revalidatePath("/sprint/setup");
}

const phaseSchema = z
  .object({
    id: uuid.optional(),
    name: z.string().trim().min(1, "Name the phase.").max(60, "Keep the name under 60 characters."),
    startsOn: isoDate,
    endsOn: isoDate,
  })
  .refine((p) => p.endsOn >= p.startsOn, { message: "The phase has to end after it starts." });

/**
 * Add a phase at the end of the plan, or rename or re-date one. The first
 * phase that covers today becomes the current one.
 */
export async function savePhase(input: z.input<typeof phaseSchema>): Promise<PhaseResult<{ id: string }>> {
  const parsed = phaseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the phase." };
  const v = parsed.data;
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: SIGNED_OUT };

  const fields = { name: v.name, starts_on: v.startsOn, ends_on: v.endsOn };
  if (v.id) {
    const { error } = await ctx.supabase.from("plan_phases").update(fields).eq("id", v.id).eq("owner_id", ctx.userId);
    if (error) return { ok: false, error: "Couldn't save the phase. Try again." };
    revalidatePhases();
    return { ok: true, data: { id: v.id } };
  }

  const [phases, today] = await Promise.all([loadPhases(ctx.supabase, ctx.userId), todayIsoLocal()]);
  const startsNow = !currentPhaseOf(phases) && v.startsOn <= today && today <= v.endsOn;
  const { data, error } = await ctx.supabase
    .from("plan_phases")
    .insert({
      ...fields,
      owner_id: ctx.userId,
      position: phases.reduce((max, p) => Math.max(max, p.position), 0) + 1,
      status: startsNow ? "current" : "upcoming",
      started_at: startsNow ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Couldn't add the phase. Try again." };
  revalidatePhases();
  return { ok: true, data: { id: data.id } };
}

/** Only a phase that hasn't started can go; its steps stay, without a phase. */
export async function deletePhase(id: string): Promise<PhaseResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "That phase doesn't exist." };
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: SIGNED_OUT };
  const phases = await loadPhases(ctx.supabase, ctx.userId);
  const phase = phases.find((p) => p.id === id);
  if (!phase) return { ok: false, error: "That phase doesn't exist." };
  if (phase.status !== "upcoming") return { ok: false, error: "Only a phase that hasn't started can be removed." };

  const { error } = await ctx.supabase.from("plan_phases").delete().eq("id", id).eq("owner_id", ctx.userId);
  if (error) return { ok: false, error: "Couldn't remove the phase. Try again." };
  // Close the gap so the numbers stay 1, 2, 3…
  for (const later of phases.filter((p) => p.position > phase.position)) {
    await ctx.supabase.from("plan_phases").update({ position: later.position - 1 }).eq("id", later.id).eq("owner_id", ctx.userId);
  }
  revalidatePhases();
  return { ok: true };
}

/**
 * Close the current phase and start the next: one goal per push stream,
 * holding that phase's steps from the stream's long-range goals. The current
 * phase's goals have to be closed first, so phases never pile up.
 */
export async function startNextPhase(): Promise<PhaseResult<{ created: number }>> {
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: SIGNED_OUT };
  const [phases, today] = await Promise.all([loadPhases(ctx.supabase, ctx.userId), todayIsoLocal()]);
  const current = currentPhaseOf(phases);
  const next = nextPhaseOf(phases);
  if (!next) return { ok: false, error: "There's no next phase. Add one first." };

  const [{ data: goals }, { data: streams }, { data: steps }] = await Promise.all([
    ctx.supabase.from("goals").select("id, stream_id, level, status, phase_id, area, is_private").eq("owner_id", ctx.userId),
    ctx.supabase.from("streams").select("id, name, focus, area").eq("owner_id", ctx.userId).is("archived_at", null).order("position"),
    ctx.supabase.from("goal_steps").select("id, goal_id, phase_id, title, position").eq("owner_id", ctx.userId).eq("phase_id", next.id).order("position"),
  ]);

  if (current) {
    const open = (goals ?? []).filter((g) => g.phase_id === current.id && (g.status === "active" || g.status === "paused"));
    if (open.length > 0) {
      return {
        ok: false,
        error: `Close ${phaseLabel(current)} first: ${open.length} of its goals ${open.length === 1 ? "is" : "are"} still open. Mark each done or let it go.`,
      };
    }
  }

  const plan = draftPhaseGoals(next, streams ?? [], goals ?? [], steps ?? []);

  // One current phase at a time: finish the old one before starting the new.
  if (current) {
    const { error } = await ctx.supabase
      .from("plan_phases")
      .update({ status: "done", finished_at: new Date().toISOString() })
      .eq("id", current.id)
      .eq("owner_id", ctx.userId);
    if (error) return { ok: false, error: "Couldn't close the current phase. Try again." };
  }
  const { error: startError } = await ctx.supabase
    .from("plan_phases")
    .update({ status: "current", started_at: new Date().toISOString() })
    .eq("id", next.id)
    .eq("owner_id", ctx.userId);
  if (startError) return { ok: false, error: "Couldn't start the phase. Try again." };

  const startDate = next.startsOn > today ? next.startsOn : today;
  const days = (Date.parse(next.endsOn) - Date.parse(startDate)) / 86_400_000;
  const streamById = new Map((streams ?? []).map((s) => [s.id, s]));
  const goalById = new Map((goals ?? []).map((g) => [g.id, g]));
  let created = 0;
  for (const draft of plan.goals) {
    const parent = goalById.get(draft.parentId);
    const { data: goal, error } = await ctx.supabase
      .from("goals")
      .insert({
        owner_id: ctx.userId,
        title: draft.title,
        why: "",
        area: streamById.get(draft.streamId)?.area ?? parent?.area ?? "self",
        horizon: "custom",
        start_date: startDate,
        target_date: next.endsOn,
        track_type: "steps",
        level: days <= 120 ? "quarter" : "year",
        parent_id: draft.parentId,
        stream_id: draft.streamId,
        phase_id: next.id,
        is_private: parent?.is_private ?? false,
        checkin_every_days: days <= 120 ? 7 : 14,
      })
      .select("id")
      .single();
    if (error || !goal) return { ok: false, error: `Started ${phaseLabel(next)}, but couldn't create the ${draft.streamName} goal. Add it by hand.` };
    await ctx.supabase.from("goal_steps").insert(
      draft.steps.map((title, position) => ({ goal_id: goal.id, owner_id: ctx.userId, title, position, phase_id: next.id }))
    );
    created += 1;
  }

  revalidatePhases();
  revalidatePath("/dashboard");
  return { ok: true, data: { created } };
}

/** Plan a long-range goal's step for a phase, or take it out of one. */
export async function setStepPhase(stepId: string, phaseId: string | null): Promise<PhaseResult> {
  if (!uuid.safeParse(stepId).success || (phaseId !== null && !uuid.safeParse(phaseId).success)) {
    return { ok: false, error: "That step doesn't exist." };
  }
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: SIGNED_OUT };
  const { data, error } = await ctx.supabase
    .from("goal_steps")
    .update({ phase_id: phaseId })
    .eq("id", stepId)
    .eq("owner_id", ctx.userId)
    .select("goal_id")
    .single();
  if (error || !data) return { ok: false, error: "Couldn't move the step. Try again." };
  revalidatePath(`/goals/${data.goal_id}`);
  revalidatePath("/goals/phases");
  return { ok: true };
}
