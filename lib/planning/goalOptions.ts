// Goal choices for "Helps a goal" pickers on sprint tasks and todos, grouped
// by stream. Within a stream, goals running right now at the quarter or
// project level come first, since that's where the week's work belongs.

import { effectiveStreams } from "./streams";

export type GoalOption = { id: string; title: string; group?: string | null };

type PickableGoal = {
  id: string;
  title: string;
  parent_id: string | null;
  stream_id: string | null;
  level: string | null;
  start_date: string;
  target_date: string;
};

const NEAR_LEVELS = new Set(["quarter", "project"]);

export function groupGoalOptions(
  goals: PickableGoal[],
  streams: { id: string; name: string }[],
  todayIso: string
): GoalOption[] {
  if (streams.length === 0) return goals.map(({ id, title }) => ({ id, title }));
  const streamOf = effectiveStreams(goals);
  const order = new Map(streams.map((s, i) => [s.id, i]));
  const nameOf = new Map(streams.map((s) => [s.id, s.name]));
  const current = (g: PickableGoal) => NEAR_LEVELS.has(g.level ?? "") && g.start_date <= todayIso && g.target_date >= todayIso;

  return [...goals]
    .sort((a, b) => {
      const sa = order.get(streamOf.get(a.id) ?? "") ?? streams.length;
      const sb = order.get(streamOf.get(b.id) ?? "") ?? streams.length;
      if (sa !== sb) return sa - sb;
      if (current(a) !== current(b)) return current(a) ? -1 : 1;
      return a.target_date.localeCompare(b.target_date);
    })
    .map((g) => ({ id: g.id, title: g.title, group: nameOf.get(streamOf.get(g.id) ?? "") ?? "Other goals" }));
}
