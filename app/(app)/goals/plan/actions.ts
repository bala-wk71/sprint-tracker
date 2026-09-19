"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { todayIsoLocal } from "@/lib/dates";
import { generateJson } from "@/lib/ai/gemini";
import {
  PLANNER_TURN_SCHEMA,
  getImportPrompt,
  getPlannerPrompt,
  type Specialist,
} from "@/lib/ai/planning";
import {
  PLAN_DRAFT_RESPONSE_SCHEMA,
  goalsInSaveOrder,
  normalizeDraft,
  planDraftSchema,
  type PlanDraft,
} from "@/lib/planning/draft";
import { defaultCheckinDays, lengthInDays } from "@/lib/goals/constants";
import { formatMeasure } from "@/lib/planning/format";

export type DraftResult<T> = { ok: true; data: T } | { ok: false; error: string };

const SIGNED_OUT = "You're signed out. Sign in and try again.";
const MAX_MARKDOWN = 40_000;
/**
 * Unbounded, gemini-2.5-flash spent up to 5 minutes thinking over a full
 * roadmap, past the function time limit. Extraction needs little reasoning.
 */
const IMPORT_THINKING_BUDGET = 2048;

async function ctxOrNull() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, userId: user.id } : null;
}

type Ctx = NonNullable<Awaited<ReturnType<typeof ctxOrNull>>>;

async function streamNames(ctx: Ctx) {
  const { data } = await ctx.supabase
    .from("streams")
    .select("name")
    .eq("owner_id", ctx.userId)
    .is("archived_at", null)
    .order("position");
  return (data ?? []).map((s) => s.name);
}

function aiError(err: unknown, fallback: string) {
  const message = err instanceof Error ? err.message : "";
  if (/too much/i.test(message)) return "That plan is too long to read in one go. Try splitting it into two files.";
  if (/free allowance/i.test(message)) return message;
  if (/429|quota|rate/i.test(message)) return "The AI is busy right now. Wait a minute and try again.";
  return fallback;
}

// ---------------------------------------------------------------------------
// Import a Markdown roadmap

export async function importRoadmap(
  markdown: string
): Promise<DraftResult<{ draft: PlanDraft; warnings: string[] }>> {
  const text = markdown.trim();
  if (text.length < 40) return { ok: false, error: "Paste or upload your plan first." };
  if (text.length > MAX_MARKDOWN) {
    return { ok: false, error: "That file is longer than 40,000 characters. Split it into two plans." };
  }
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: SIGNED_OUT };
  const todayIso = await todayIsoLocal();

  try {
    const raw = await generateJson(
      getImportPrompt(todayIso, await streamNames(ctx)),
      [{ role: "user", parts: [{ text }] }],
      PLAN_DRAFT_RESPONSE_SCHEMA,
      { temperature: 0.1, maxOutputTokens: 32768, thinkingBudget: IMPORT_THINKING_BUDGET, quality: "best" }
    );
    const parsed = planDraftSchema.safeParse(raw);
    if (!parsed.success || parsed.data.goals.length === 0) {
      return { ok: false, error: "Couldn't find goals in that. Check it's your plan and try again." };
    }
    return { ok: true, data: normalizeDraft(parsed.data, todayIso) };
  } catch (err) {
    return { ok: false, error: aiError(err, "Reading the plan failed. Try again.") };
  }
}

// ---------------------------------------------------------------------------
// Plan with the coach

const turnSchema = z.object({
  specialist: z.enum(["health", "business", "skills"]),
  messages: z
    .array(z.object({ role: z.enum(["user", "model"]), text: z.string().trim().min(1).max(4000) }))
    .min(1)
    .max(40),
  draft: z.unknown().nullable(),
  goalId: z.string().uuid().nullable(),
});

/** Only what planning needs: fronts, goals, and the latest body numbers. No journal text. */
async function plannerContext(ctx: Ctx, todayIso: string): Promise<string> {
  const [{ data: streams }, { data: goals }, { data: body }, { data: profile }, { data: report }] = await Promise.all([
    ctx.supabase.from("streams").select("id, name, weekly_hours").eq("owner_id", ctx.userId).is("archived_at", null),
    ctx.supabase
      .from("goals")
      .select("title, stream_id, target_date, level")
      .eq("owner_id", ctx.userId)
      .eq("status", "active")
      .order("target_date")
      .limit(20),
    ctx.supabase
      .from("body_metrics")
      .select("measured_on, weight_kg, body_fat_pct, muscle_mass_kg, waist_cm")
      .eq("owner_id", ctx.userId)
      .order("measured_on", { ascending: false })
      .limit(1)
      .maybeSingle(),
    ctx.supabase
      .from("health_profiles")
      .select("height_cm, sex, birth_date, goal_type, weekly_workout_goal")
      .eq("owner_id", ctx.userId)
      .maybeSingle(),
    ctx.supabase
      .from("plan_reports")
      .select("period, period_start, words")
      .eq("owner_id", ctx.userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const nameOf = new Map((streams ?? []).map((s) => [s.id, s.name]));
  const lines = [`Today: ${todayIso}.`];
  if (streams?.length) {
    lines.push(
      `Streams: ${streams.map((s) => `${s.name}${s.weekly_hours ? ` (${s.weekly_hours}h/week planned)` : ""}`).join("; ")}.`
    );
  }
  if (goals?.length) {
    lines.push(
      "Active goals:",
      ...goals.map((g) => `- ${g.title} [${nameOf.get(g.stream_id ?? "") ?? "no stream"}${g.level ? `, ${g.level}` : ""}] ends ${g.target_date}`)
    );
  }
  if (profile) {
    const parts = [
      profile.height_cm ? `height ${profile.height_cm} cm` : null,
      profile.sex ? `sex ${profile.sex}` : null,
      profile.birth_date ? `born ${profile.birth_date}` : null,
      profile.goal_type ? `current body goal: ${profile.goal_type}` : null,
      profile.weekly_workout_goal ? `aims for ${profile.weekly_workout_goal} workouts/week` : null,
    ].filter(Boolean);
    if (parts.length) lines.push(`Health profile: ${parts.join(", ")}.`);
  }
  if (body) {
    const parts = [
      body.weight_kg !== null ? `weight ${formatMeasure(Number(body.weight_kg), "kg")}` : null,
      body.body_fat_pct !== null ? `body fat ${body.body_fat_pct}%` : null,
      body.muscle_mass_kg !== null ? `muscle ${body.muscle_mass_kg} kg` : null,
      body.waist_cm !== null ? `waist ${body.waist_cm} cm` : null,
    ].filter(Boolean);
    if (parts.length) lines.push(`Latest body log (${body.measured_on}): ${parts.join(", ")}.`);
  }
  if (report) {
    const w = report.words as { headline?: string; nextFocus?: string } | null;
    if (w?.headline) {
      lines.push(`Latest ${report.period} report (from ${report.period_start}): ${w.headline}${w.nextFocus ? ` Focus: ${w.nextFocus}` : ""}`);
    }
  }
  return lines.join("\n");
}

export async function planTurn(
  input: z.input<typeof turnSchema>
): Promise<DraftResult<{ reply: string; draft: PlanDraft | null; warnings: string[] }>> {
  const parsed = turnSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Write a message first." };
  const v = parsed.data;
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: SIGNED_OUT };
  const todayIso = await todayIsoLocal();

  let existing: { id: string; title: string; target_date: string } | null = null;
  if (v.goalId) {
    const { data } = await ctx.supabase
      .from("goals")
      .select("id, title, target_date")
      .eq("id", v.goalId)
      .eq("owner_id", ctx.userId)
      .maybeSingle();
    existing = data;
  }

  // The current plan rides along as the last user message, so the model
  // edits it rather than starting over.
  const current = v.draft ? planDraftSchema.safeParse(v.draft) : null;
  const history = v.messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  if (current?.success && current.data.goals.length) {
    const last = history[history.length - 1];
    last.parts.push({ text: `\n\n(Current plan, edit this rather than starting again: ${JSON.stringify(current.data)})` });
  }

  try {
    const raw = (await generateJson(
      getPlannerPrompt(
        v.specialist as Specialist,
        todayIso,
        await plannerContext(ctx, todayIso),
        existing ? { title: existing.title, targetDate: existing.target_date } : null
      ),
      history,
      PLANNER_TURN_SCHEMA,
      { temperature: 0.5, maxOutputTokens: 16384, thinkingBudget: IMPORT_THINKING_BUDGET, quality: "good" }
    )) as { reply?: unknown; draft?: unknown };
    const reply = typeof raw?.reply === "string" && raw.reply.trim() ? raw.reply.trim() : null;
    if (!reply) return { ok: false, error: "The coach's answer came back empty. Try again." };

    // A plan only comes after the three options were offered (or while one is
    // being edited). Weaker models jump ahead and draft a plan from the first
    // message, before knowing the person's limits.
    const optionsShown = v.messages.some((m) => m.role === "model" && /steady/i.test(m.text) && /stretch/i.test(m.text));
    const draftParsed = raw.draft && (optionsShown || (current?.success && current.data.goals.length > 0)) ? planDraftSchema.safeParse(raw.draft) : null;
    if (!draftParsed?.success || draftParsed.data.goals.length === 0) {
      return { ok: true, data: { reply, draft: null, warnings: [] } };
    }
    const draft = draftParsed.data;
    // The plan is often for a goal they already have ("lose weight" when a
    // weight goal exists), and the model reuses its title. Attach the plan to
    // that goal instead of creating a duplicate; dropping it instead lost the
    // plan's targets and actions and left only its quarter goal.
    const { data: activeGoals } = await ctx.supabase
      .from("goals")
      .select("id, title, target_date")
      .eq("owner_id", ctx.userId)
      .in("status", ["active", "paused"]);
    const candidates = (activeGoals ?? []).filter((g) => g.id !== existing?.id);
    const matchOf = (title: string) => {
      const t = title.trim().toLowerCase();
      return (
        candidates.find((g) => g.title.trim().toLowerCase() === t) ??
        // "run 10K without stopping" copied from "Verification goal: run 10K without stopping".
        (t.length >= 12
          ? candidates.find((g) => {
              const x = g.title.trim().toLowerCase();
              return x.includes(t) || (x.length >= 12 && t.includes(x));
            })
          : undefined)
      );
    };
    if (existing) {
      // The first top-level goal is the existing one: attach to it instead of creating a copy.
      const top = draft.goals.find((g) => !g.parentKey) ?? draft.goals[0];
      top.existingId = existing.id;
      top.title = existing.title;
    }
    const attachedTo: string[] = [];
    for (const g of draft.goals) {
      if (g.existingId) continue;
      const match = matchOf(g.title);
      if (!match || draft.goals.some((o) => o.existingId === match.id)) continue;
      g.existingId = match.id;
      g.title = match.title;
      g.targetDate = match.target_date;
      attachedTo.push(match.title);
    }
    const { draft: clean, warnings } = normalizeDraft(draft, todayIso);
    for (const title of attachedTo) {
      warnings.unshift(`This plan adds to your existing goal “${title}”. Targets and actions it already has are kept as they are.`);
    }
    return { ok: true, data: { reply, draft: clean, warnings } };
  } catch (err) {
    return { ok: false, error: aiError(err, "The coach couldn't answer just now. Try again.") };
  }
}

// ---------------------------------------------------------------------------
// Save a reviewed draft

export async function savePlanDraft(
  input: unknown,
  options: { saveNotes?: boolean } = {}
): Promise<DraftResult<{ goals: number; firstGoalId: string | null; notePageId: string | null }>> {
  const parsed = planDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "The plan couldn't be read. Try again." };
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: SIGNED_OUT };
  const todayIso = await todayIsoLocal();
  const { draft } = normalizeDraft(parsed.data, todayIso);
  const goals = goalsInSaveOrder(draft.goals.filter((g) => g.include));
  if (goals.length === 0) return { ok: false, error: "Pick at least one goal to save." };

  const createdGoals: string[] = [];
  const createdStreams: string[] = [];
  // Rows added to a goal that already existed; new goals take theirs with them.
  const added = { measures: [] as string[], levers: [] as string[], steps: [] as string[] };
  const undo = async (message: string): Promise<DraftResult<never>> => {
    if (added.measures.length) await ctx.supabase.from("goal_measures").delete().in("id", added.measures).eq("owner_id", ctx.userId);
    if (added.levers.length) await ctx.supabase.from("goal_levers").delete().in("id", added.levers).eq("owner_id", ctx.userId);
    if (added.steps.length) await ctx.supabase.from("goal_steps").delete().in("id", added.steps).eq("owner_id", ctx.userId);
    if (createdGoals.length) await ctx.supabase.from("goals").delete().in("id", createdGoals).eq("owner_id", ctx.userId);
    if (createdStreams.length) await ctx.supabase.from("streams").delete().in("id", createdStreams).eq("owner_id", ctx.userId);
    return { ok: false, error: message };
  };

  // Streams: reuse by name, create the rest.
  const { data: existingStreams } = await ctx.supabase
    .from("streams")
    .select("id, name, position")
    .eq("owner_id", ctx.userId)
    .is("archived_at", null);
  const streamIdByName = new Map((existingStreams ?? []).map((s) => [s.name.toLowerCase(), s.id]));
  const streamIdByKey = new Map<string, string>();
  let position = existingStreams?.length ?? 0;
  const usedStreamKeys = new Set(goals.map((g) => g.streamKey).filter(Boolean));
  for (const s of draft.streams) {
    if (!s.include || !usedStreamKeys.has(s.key)) continue;
    const known = streamIdByName.get(s.name.toLowerCase());
    if (known) {
      streamIdByKey.set(s.key, known);
      continue;
    }
    const { data, error } = await ctx.supabase
      .from("streams")
      .insert({ owner_id: ctx.userId, name: s.name, area: s.area, weekly_hours: s.weeklyHours, position: position++ })
      .select("id")
      .single();
    if (error || !data) return undo(`Couldn't create the stream “${s.name}”. Nothing was saved.`);
    createdStreams.push(data.id);
    streamIdByKey.set(s.key, data.id);
    streamIdByName.set(s.name.toLowerCase(), data.id);
  }

  const goalIdByKey = new Map<string, string>();
  for (const g of goals) {
    const streamId = g.streamKey ? streamIdByKey.get(g.streamKey) ?? null : null;
    let goalId: string;
    if (g.existingId) {
      const { data } = await ctx.supabase
        .from("goals")
        .select("id, stream_id")
        .eq("id", g.existingId)
        .eq("owner_id", ctx.userId)
        .maybeSingle();
      if (!data) return undo("The goal you were planning doesn't exist anymore. Nothing was saved.");
      goalId = data.id;
      if (streamId && !data.stream_id) {
        await ctx.supabase.from("goals").update({ stream_id: streamId }).eq("id", goalId).eq("owner_id", ctx.userId);
      }
    } else {
      const start = g.startDate ?? todayIso;
      const { data, error } = await ctx.supabase
        .from("goals")
        .insert({
          owner_id: ctx.userId,
          parent_id: g.parentKey ? goalIdByKey.get(g.parentKey) ?? null : null,
          stream_id: streamId,
          level: g.level,
          title: g.title,
          why: g.why,
          area: g.area,
          horizon: "custom",
          start_date: start,
          target_date: g.targetDate,
          track_type: "steps",
          checkin_every_days: defaultCheckinDays(lengthInDays(start, g.targetDate)),
          // Plans hold money and health numbers; they start private and can be shared per goal.
          is_private: true,
        })
        .select("id")
        .single();
      if (error || !data) return undo(`Couldn't save “${g.title}”. Nothing was saved.`);
      goalId = data.id;
      createdGoals.push(goalId);
    }
    goalIdByKey.set(g.key, goalId);

    if (g.steps.length) {
      const { count } = await ctx.supabase.from("goal_steps").select("id", { count: "exact", head: true }).eq("goal_id", goalId);
      const { data: steps, error } = await ctx.supabase
        .from("goal_steps")
        .insert(g.steps.map((title, i) => ({ goal_id: goalId, owner_id: ctx.userId, title, position: (count ?? 0) + i })))
        .select("id");
      if (error) return undo(`Couldn't save the steps of “${g.title}”. Nothing was saved.`);
      added.steps.push(...(steps ?? []).map((r) => r.id));
    }

    // On a goal that already exists, skip targets and actions it already has.
    let knownMeasures: { label: string; source: string }[] = [];
    let knownLevers: string[] = [];
    if (g.existingId) {
      const [{ data: ms }, { data: ls }] = await Promise.all([
        ctx.supabase.from("goal_measures").select("label, source").eq("goal_id", goalId).eq("owner_id", ctx.userId),
        ctx.supabase.from("goal_levers").select("title").eq("goal_id", goalId).eq("owner_id", ctx.userId).is("archived_at", null),
      ]);
      knownMeasures = ms ?? [];
      knownLevers = (ls ?? []).map((l) => l.title.trim().toLowerCase());
    }
    const newMeasures = g.measures.filter(
      (m) =>
        !knownMeasures.some(
          (k) => k.label.trim().toLowerCase() === m.label.trim().toLowerCase() || (m.source !== "manual" && k.source === m.source)
        )
    );
    const newLevers = g.levers.filter((l) => !knownLevers.includes(l.title.trim().toLowerCase()));

    for (const [i, m] of newMeasures.entries()) {
      const ladder = m.kind === "ladder";
      const { data: measure, error } = await ctx.supabase
        .from("goal_measures")
        .insert({
          goal_id: goalId,
          owner_id: ctx.userId,
          label: m.label,
          kind: m.kind,
          unit: ladder ? "level" : m.unit,
          direction: ladder ? "up" : m.direction,
          interpolate: ladder ? "step" : m.interpolate,
          source: ladder ? "manual" : m.source,
          source_params:
            m.source === "loan_schedule" && m.loanEmi !== null && m.loanLastEmiOn
              ? { emi: m.loanEmi, lastEmiOn: m.loanLastEmiOn }
              : {},
          cadence: m.cadence,
          baseline_value: m.baselineValue,
          baseline_on: m.baselineOn,
          scale: ladder ? m.levels.map((l, n) => ({ level: n + 1, title: l.title, proof: l.proof })) : [],
          position: i,
        })
        .select("id")
        .single();
      if (error || !measure) return undo(`Couldn't save the target “${m.label}”. Nothing was saved.`);
      added.measures.push(measure.id);
      if (m.checkpoints.length) {
        const { error: cpError } = await ctx.supabase.from("measure_checkpoints").insert(
          m.checkpoints.map((c) => ({
            measure_id: measure.id,
            owner_id: ctx.userId,
            target_date: c.date,
            label: c.label,
            min_value: c.min,
            max_value: c.max,
            relative: c.relative,
            hold_until: c.holdUntil,
          }))
        );
        if (cpError) return undo(`Couldn't save the path for “${m.label}”. Nothing was saved.`);
      }
    }

    if (newLevers.length) {
      const { data: levers, error } = await ctx.supabase.from("goal_levers").insert(
        newLevers.map((l, i) => ({
          goal_id: goalId,
          owner_id: ctx.userId,
          title: l.title,
          source: l.source,
          period: l.period,
          target: l.target,
          floor: l.floor ?? Math.ceil(l.target / 2),
          position: i,
        }))
      ).select("id");
      if (error) return undo(`Couldn't save the weekly actions of “${g.title}”. Nothing was saved.`);
      added.levers.push(...(levers ?? []).map((r) => r.id));
    }
  }

  // The reference parts of a roadmap (decision rules, protection, reasons)
  // aren't tracked, so they're kept as a page in Notes rather than lost.
  let notePageId: string | null = null;
  if (options.saveNotes && draft.notes.trim()) {
    const { data } = await ctx.supabase
      .from("note_pages")
      .insert({ owner_id: ctx.userId, title: `Roadmap notes (${todayIso})`, body: draft.notes.trim() })
      .select("id")
      .single();
    notePageId = data?.id ?? null;
    revalidatePath("/notes");
  }

  revalidatePath("/goals", "layout");
  revalidatePath("/dashboard");
  const first = goals.find((g) => !g.parentKey) ?? goals[0];
  return { ok: true, data: { goals: goals.length, firstGoalId: goalIdByKey.get(first.key) ?? null, notePageId } };
}
