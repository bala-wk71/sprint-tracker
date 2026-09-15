import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { generateJson } from "@/lib/ai/gemini";
import {
  GOAL_REVIEW_RESPONSE_SCHEMA,
  buildGoalReviewContext,
  getGoalReviewPrompt,
  goalReviewResultSchema,
} from "@/lib/ai/goals";
import type { AiPersona } from "@/lib/ai/prompts";
import { todayIsoLocal } from "@/lib/dates";
import { addDaysIso } from "@/lib/week";
import { horizonLabel } from "@/lib/goals/constants";

const bodySchema = z.object({ goalId: z.string().uuid() });

/** One review per goal per week: enough to see a trend, cheap enough to leave on. */
const COOLDOWN_DAYS = 7;

const REVIEW_COLUMNS = "id, direction, summary, reasons, next_step, input_counts, read_journal, created_at";

/**
 * "How am I doing?" for one goal.
 *
 * User-triggered, so it runs as the signed-in user under RLS. Unlike the
 * health report the result is saved: the point of a goal review is comparing
 * this month's reading with last month's.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick a goal to review." }, { status: 400 });
  const { goalId } = parsed.data;

  const todayIso = await todayIsoLocal();
  const [{ data: goal }, { data: profile }, { data: last }] = await Promise.all([
    supabase.from("goals").select("*").eq("id", goalId).eq("owner_id", user.id).maybeSingle(),
    supabase.from("users").select("ai_persona, coach_reads_journal").eq("id", user.id).single(),
    supabase
      .from("goal_reviews")
      .select(REVIEW_COLUMNS)
      .eq("goal_id", goalId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!goal) return NextResponse.json({ error: "That goal doesn't exist anymore." }, { status: 404 });

  if (last && last.created_at.slice(0, 10) > addDaysIso(todayIso, -COOLDOWN_DAYS)) {
    const next = addDaysIso(last.created_at.slice(0, 10), COOLDOWN_DAYS);
    return NextResponse.json(
      {
        error: `This goal was reviewed in the last week. You can ask again on ${format(new Date(`${next}T00:00:00`), "EEE d MMM")}.`,
        review: last,
      },
      { status: 429 }
    );
  }

  const readJournal = Boolean(profile?.coach_reads_journal);
  const [{ data: steps }, { data: entries }, { data: timeRows }, { count: taskCount }, { data: todos }] =
    await Promise.all([
      supabase.from("goal_steps").select("title, done_at").eq("goal_id", goalId).order("position"),
      supabase
        .from("journal_entries")
        .select("entry_date, kind, body, on_track, value, hide_from_coach")
        .eq("goal_id", goalId)
        .eq("owner_id", user.id)
        .eq("kind", "check_in")
        .order("entry_date", { ascending: false })
        .limit(40),
      supabase
        .from("time_entries")
        .select("duration_hours, daily_logs!inner(log_date), tasks!inner(goal_id)")
        .eq("owner_id", user.id)
        .eq("tasks.goal_id", goalId),
      supabase.from("tasks").select("id", { count: "exact", head: true }).eq("goal_id", goalId).eq("owner_id", user.id),
      supabase.from("todo_tasks").select("is_completed").eq("goal_id", goalId).eq("owner_id", user.id),
    ]);

  const since28 = addDaysIso(todayIso, -28);
  let total = 0;
  let last28 = 0;
  let lastWorkedOn: string | null = null;
  for (const row of timeRows ?? []) {
    const h = Number(row.duration_hours || 0);
    const logs = row.daily_logs as { log_date: string } | { log_date: string }[] | null;
    const date = (Array.isArray(logs) ? logs[0] : logs)?.log_date;
    total += h;
    if (date && date >= since28) last28 += h;
    if (date && (!lastWorkedOn || date > lastWorkedOn)) lastWorkedOn = date;
  }
  const round1 = (n: number) => Math.round(n * 10) / 10;

  const stepRows = steps ?? [];
  const checkins = (entries ?? []).map((e) => ({
    date: e.entry_date,
    onTrack: e.on_track,
    value: e.value,
    note: readJournal && !e.hide_from_coach ? e.body : null,
  }));
  const stepsDone = stepRows.filter((s) => s.done_at).length;
  const numberMoved = goal.track_type === "number" && goal.current_value !== null && goal.current_value !== goal.start_value;

  // Spend nothing on a review that can only say "not enough to go on".
  if (checkins.length === 0 && total === 0 && stepsDone === 0 && !numberMoved) {
    return NextResponse.json(
      { error: "There's nothing to review yet. Check in once or twice, or link some work to this goal, then ask again." },
      { status: 400 }
    );
  }

  const context = buildGoalReviewContext({
    goal: {
      title: goal.title,
      why: goal.why,
      area: goal.area,
      length: horizonLabel(goal.horizon, goal.start_date, goal.target_date),
      startDate: goal.start_date,
      targetDate: goal.target_date,
      status: goal.status,
      trackType: goal.track_type,
      startValue: goal.start_value,
      targetValue: goal.target_value,
      currentValue: goal.current_value,
      unit: goal.unit,
    },
    steps: stepRows.map((s) => ({ title: s.title, doneAt: s.done_at })),
    checkins,
    hours: { total: round1(total), last28: round1(last28), lastWorkedOn },
    linked: {
      tasks: taskCount ?? 0,
      todos: todos?.length ?? 0,
      todosDone: (todos ?? []).filter((t) => t.is_completed).length,
    },
    previous: last
      ? { date: last.created_at.slice(0, 10), direction: last.direction, summary: last.summary, nextStep: last.next_step }
      : null,
  });

  const persona: AiPersona = profile?.ai_persona ?? "rational";

  try {
    const raw = await generateJson(
      `${getGoalReviewPrompt(persona, todayIso, readJournal)}\n\n## The goal and its data\n${context}`,
      [{ role: "user", parts: [{ text: "How am I doing on this goal?" }] }],
      GOAL_REVIEW_RESPONSE_SCHEMA,
      { temperature: 0.3 }
    );
    const result = goalReviewResultSchema.safeParse(raw);
    if (!result.success) {
      return NextResponse.json({ error: "The coach's answer came back unreadable. Try again." }, { status: 502 });
    }

    const { data: saved, error } = await supabase
      .from("goal_reviews")
      .insert({
        goal_id: goal.id,
        owner_id: user.id,
        direction: result.data.direction,
        summary: result.data.summary,
        reasons: result.data.reasons,
        next_step: result.data.next_step,
        input_counts: {
          checkins: checkins.length,
          hours: round1(total),
          steps_done: stepsDone,
          steps_total: stepRows.length,
          notes_read: checkins.filter((c) => c.note).length,
        },
        read_journal: readJournal,
      })
      .select(REVIEW_COLUMNS)
      .single();
    if (error || !saved) {
      return NextResponse.json({ error: "Couldn't save the review. Try again." }, { status: 500 });
    }

    return NextResponse.json({ review: saved });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "The review failed." },
      { status: 500 }
    );
  }
}
