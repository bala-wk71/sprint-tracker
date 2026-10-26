// Progress for Target and Habit goals, which live outside the goal row: a
// Target reads its measure (Health, a loan, or typed readings), a Habit counts
// its weeks from the logs. One loader so every list shows them the same way.

import { format } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { WeekStartDay } from "@/lib/week";
import { weekStartIsoOf } from "@/lib/week";
import { formatBand, formatMeasure } from "@/lib/planning/format";
import { loadLeverDaily, loadLevers, loadMeasureSummaries, type GoalNode } from "@/lib/planning/load";
import type { MeasureSummary } from "@/lib/planning/summary";
import type { SummaryStatus } from "@/lib/planning/constants";
import { habitLine, readHabit, type HabitRead } from "./habit";

type Client = SupabaseClient<Database>;

export type TypedProgress =
  | { kind: "target"; pct: number | null; label: string; status: SummaryStatus }
  | { kind: "habit"; pct: number; label: string; habit: HabitRead };

export type TypedGoal = GoalNode & { track_type: string; start_date: string; target_date: string };

/** "94 kg now · 87–88 kg by 31 Dec", or what's missing before it can say that. */
export function targetLine(s: MeasureSummary, todayIso: string): string {
  const unit = s.measure.unit;
  const finish = s.next ?? s.path.checkpoints.at(-1) ?? null;
  const when = (iso: string) =>
    format(new Date(`${iso}T00:00:00`), iso.slice(0, 4) === todayIso.slice(0, 4) ? "d MMM" : "MMM yyyy");
  const goal = finish ? `${formatBand(finish.min, finish.max, unit)} by ${when(finish.date)}` : null;
  if (!s.latest) return goal ? `No reading yet · ${goal}` : "No reading yet";
  const now = `${formatMeasure(s.latest.value, unit)} now`;
  return goal ? `${now} · ${goal}` : now;
}

export async function loadTypedProgress(
  supabase: Client,
  ownerId: string,
  goals: TypedGoal[],
  todayIso: string,
  weekStartDay: WeekStartDay,
  opts: {
    /** Measure summaries the caller already has, keyed by goal. */
    summaries?: Map<string, MeasureSummary[]>;
    /** Every goal of the owner, so hours on smaller goals count towards a habit. */
    allGoals?: GoalNode[];
  } = {}
): Promise<Map<string, TypedProgress>> {
  const out = new Map<string, TypedProgress>();
  const targets = goals.filter((g) => g.track_type === "number");
  const habits = goals.filter((g) => g.track_type === "habit");

  const [summaries, levers] = await Promise.all([
    targets.length === 0
      ? Promise.resolve(new Map<string, MeasureSummary[]>())
      : opts.summaries && targets.every((g) => opts.summaries!.has(g.id))
        ? Promise.resolve(opts.summaries)
        : loadMeasureSummaries(supabase, ownerId, targets, todayIso),
    loadLevers(supabase, ownerId, habits.map((g) => g.id)),
  ]);

  for (const g of targets) {
    const s = summaries.get(g.id)?.[0];
    if (s) out.set(g.id, { kind: "target", pct: s.covered, label: targetLine(s, todayIso), status: s.status });
  }

  if (levers.length > 0) {
    const leverOf = new Map<string, (typeof levers)[number]>();
    for (const l of levers) if (!leverOf.has(l.goal_id)) leverOf.set(l.goal_id, l);
    const from = habits.map((g) => weekStartIsoOf(g.start_date, weekStartDay)).sort()[0];
    const daily = await loadLeverDaily(supabase, ownerId, [...leverOf.values()], opts.allGoals ?? goals, from, todayIso);
    for (const g of habits) {
      const lever = leverOf.get(g.id);
      if (!lever) continue;
      const habit = readHabit(daily.get(lever.id), {
        startIso: g.start_date,
        endIso: g.target_date,
        todayIso,
        weekStartDay,
        target: lever.target,
        floor: lever.floor,
      });
      out.set(g.id, {
        kind: "habit",
        pct: habit.total ? habit.kept / habit.total : 0,
        label: habitLine(habit, lever.source === "linked_hours" ? "h" : ""),
        habit,
      });
    }
  }
  return out;
}
