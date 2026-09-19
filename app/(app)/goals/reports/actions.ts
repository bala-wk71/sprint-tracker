"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { getWeekStartDay, todayIsoLocal } from "@/lib/dates";
import { generateJson } from "@/lib/ai/gemini";
import { getReportPrompt, proposalSchema, reportResponseSchema, reportWordsSchema, type WrittenPeriod } from "@/lib/ai/reports";
import { buildReportNumbers } from "@/lib/planning/report";
import { reportNumbersText } from "@/lib/planning/reportText";
import { periodRange } from "@/lib/planning/periods";
import { loadMeasureSummaries } from "@/lib/planning/load";
import { expectedBand } from "@/lib/planning/projection";
import { formatBand } from "@/lib/planning/format";
import { nextQuarter, quarterEndIso, quarterLabel, quarterOf, quarterStartIso } from "@/lib/planning/quarters";
import { proposalDraft, type ProposalDestination } from "@/lib/planning/proposal";
import { GOAL_AREA_VALUES, type GoalArea } from "@/lib/goals/constants";
import type { Json } from "@/lib/supabase/types";

export type ReportResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

const SIGNED_OUT = "You're signed out. Sign in and try again.";
/** Writing from numbers needs a little reasoning, not minutes of it. */
const REPORT_THINKING_BUDGET = 1024;

async function ctxOrNull() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, userId: user.id } : null;
}
type Ctx = NonNullable<Awaited<ReturnType<typeof ctxOrNull>>>;

const toArea = (value: string | null | undefined): GoalArea =>
  (GOAL_AREA_VALUES as readonly string[]).includes(value ?? "") ? (value as GoalArea) : "self";
const d = (iso: string) => format(new Date(`${iso}T00:00:00`), "d MMM yyyy");

/**
 * The destinations a quarterly review can propose work for: each with where
 * its path should be at the next quarter's end, work already planned for
 * then, and steps still open this quarter.
 */
async function nextQuarterContext(ctx: Ctx, quarterStart: string, todayIso: string) {
  const next = nextQuarter(quarterOf(quarterStart));
  const nextStart = quarterStartIso(next);
  const nextEnd = quarterEndIso(next);
  const thisEnd = quarterEndIso(quarterOf(quarterStart));
  const [{ data: goals }, { data: streams }] = await Promise.all([
    ctx.supabase
      .from("goals")
      .select("id, parent_id, stream_id, title, area, level, status, start_date, target_date")
      .eq("owner_id", ctx.userId)
      .eq("status", "active"),
    ctx.supabase.from("streams").select("id, name, area").eq("owner_id", ctx.userId).is("archived_at", null),
  ]);
  const all = goals ?? [];
  const streamById = new Map((streams ?? []).map((s) => [s.id, s]));
  const roots = all.filter(
    (g) => (g.level === "destination" || g.level === "year" || (!g.level && !g.parent_id)) && g.target_date > nextStart
  );
  if (roots.length === 0) return { next, destinations: [] as ProposalDestination[], text: "" };

  const childIds = all.filter((g) => g.parent_id && roots.some((r) => r.id === g.parent_id)).map((g) => g.id);
  const [summaries, { data: steps }] = await Promise.all([
    loadMeasureSummaries(ctx.supabase, ctx.userId, roots, todayIso),
    childIds.length
      ? ctx.supabase.from("goal_steps").select("goal_id, title, done_at").eq("owner_id", ctx.userId).in("goal_id", childIds)
      : Promise.resolve({ data: [] as { goal_id: string; title: string; done_at: string | null }[] }),
  ]);

  const destinations: ProposalDestination[] = [];
  const lines = [`## Next quarter: ${quarterLabel(next)} (${d(nextStart)} to ${d(nextEnd)})`, "Destinations:"];
  roots.slice(0, 15).forEach((g, i) => {
    const ref = `D${i + 1}`;
    const children = all.filter((c) => c.parent_id === g.id);
    const planned = children.find((c) => c.target_date >= nextStart && c.target_date <= nextEnd) ?? null;
    const stepsOf = (id: string) => (steps ?? []).filter((s) => s.goal_id === id);
    const stream = g.stream_id ? streamById.get(g.stream_id) : undefined;
    destinations.push({
      ref,
      id: g.id,
      title: g.title,
      area: toArea(g.area),
      level: g.level,
      streamName: stream?.name ?? null,
      streamArea: stream ? toArea(stream.area) : null,
      startDate: g.start_date,
      targetDate: g.target_date,
      nextQuarterGoal: planned ? { id: planned.id, title: planned.title, steps: stepsOf(planned.id).map((s) => s.title) } : null,
    });

    const paths = (summaries.get(g.id) ?? []).flatMap((s) => {
      const band = expectedBand(s.path, nextEnd);
      return band ? [`${s.measure.label} ${formatBand(band.min, band.max, s.measure.unit)}`] : [];
    });
    const openNow = children
      .filter((c) => c.target_date >= quarterStart && c.target_date <= thisEnd)
      .flatMap((c) => stepsOf(c.id).filter((s) => !s.done_at).map((s) => s.title));
    lines.push(
      `- ${ref}: “${g.title}” (${stream ? `stream ${stream.name}; ` : ""}ends ${d(g.target_date)}).` +
        (paths.length ? ` Path at ${d(nextEnd)}: ${paths.join(", ")}.` : " No number path.") +
        (planned
          ? ` Already planned for next quarter: “${planned.title}”${stepsOf(planned.id).length ? ` with steps ${stepsOf(planned.id).map((s) => `“${s.title}”`).join(", ")}` : ""}.`
          : "") +
        (openNow.length ? ` Still open this quarter: ${openNow.map((t) => `“${t}”`).join(", ")}.` : "")
    );
  });
  return { next, destinations, text: lines.join("\n") };
}

const writeSchema = z.object({
  period: z.enum(["month", "quarter", "year"]),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Write (or rewrite) the report for a month, quarter or year. */
export async function writeReport(input: { period: WrittenPeriod; start: string }): Promise<ReportResult<{ id: string }>> {
  const parsed = writeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pick a month, quarter or year." };
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: SIGNED_OUT };
  const [todayIso, weekStartDay] = await Promise.all([todayIsoLocal(), getWeekStartDay()]);
  const { period } = parsed.data;
  const { start, end } = periodRange(period, parsed.data.start, weekStartDay);
  if (start > todayIso) return { ok: false, error: "That period hasn't started yet." };

  const numbers = await buildReportNumbers(ctx.supabase, ctx.userId, period, start, todayIso, weekStartDay);
  if (numbers.streams.length === 0) {
    return { ok: false, error: `Nothing was tracked in ${numbers.label}. Add targets or weekly actions to a goal first.` };
  }
  const quarter = period === "quarter" ? await nextQuarterContext(ctx, start, todayIso) : null;
  const prompt = [reportNumbersText(numbers), quarter?.text].filter(Boolean).join("\n\n");

  let raw: unknown;
  try {
    raw = await generateJson(getReportPrompt(period), [{ role: "user", parts: [{ text: prompt }] }], reportResponseSchema(period), {
      temperature: 0.4,
      maxOutputTokens: 8192,
      thinkingBudget: REPORT_THINKING_BUDGET,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    return {
      ok: false,
      error: /429|quota|rate/i.test(message) ? "The AI is busy right now. Wait a minute and try again." : "Writing the report failed. Try again.",
    };
  }
  const words = reportWordsSchema.safeParse(raw);
  if (!words.success) return { ok: false, error: "The report came back unreadable. Try again." };

  let proposal: { draft: unknown; warnings: string[]; savedAt: null } | null = null;
  if (quarter && quarter.destinations.length) {
    const items = proposalSchema.parse((raw as { proposal?: unknown }).proposal ?? []);
    const { draft, warnings } = proposalDraft(items, quarter.destinations, quarter.next, todayIso);
    if (draft.goals.length) proposal = { draft, warnings, savedAt: null };
  }

  const { data, error } = await ctx.supabase
    .from("plan_reports")
    .upsert(
      {
        owner_id: ctx.userId,
        period,
        period_start: start,
        period_end: end,
        as_of: numbers.asOf,
        numbers: numbers as unknown as Json,
        words: words.data as unknown as Json,
        proposal: proposal as unknown as Json,
      },
      { onConflict: "owner_id,period,period_start" }
    )
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Couldn't save the report. Try again." };
  revalidatePath("/goals/reports", "layout");
  revalidatePath("/goals");
  return { ok: true, data: { id: data.id } };
}

/** After next quarter's plan is saved from a review, the offer is closed. */
export async function markProposalSaved(reportId: string): Promise<ReportResult> {
  if (!z.string().uuid().safeParse(reportId).success) return { ok: false, error: "That report doesn't exist." };
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: SIGNED_OUT };
  const { data } = await ctx.supabase
    .from("plan_reports")
    .select("proposal")
    .eq("id", reportId)
    .eq("owner_id", ctx.userId)
    .maybeSingle();
  if (!data?.proposal || typeof data.proposal !== "object") return { ok: false, error: "That report has no plan to save." };
  const { error } = await ctx.supabase
    .from("plan_reports")
    .update({ proposal: { ...(data.proposal as Record<string, Json>), savedAt: await todayIsoLocal() } })
    .eq("id", reportId)
    .eq("owner_id", ctx.userId);
  if (error) return { ok: false, error: "Couldn't update the report." };
  revalidatePath(`/goals/reports/${reportId}`);
  return { ok: true };
}

export async function deleteReport(reportId: string): Promise<ReportResult> {
  if (!z.string().uuid().safeParse(reportId).success) return { ok: false, error: "That report doesn't exist." };
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: SIGNED_OUT };
  const { error } = await ctx.supabase.from("plan_reports").delete().eq("id", reportId).eq("owner_id", ctx.userId);
  if (error) return { ok: false, error: "Couldn't delete the report." };
  revalidatePath("/goals/reports", "layout");
  return { ok: true };
}
