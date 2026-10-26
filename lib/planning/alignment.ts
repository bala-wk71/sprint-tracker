// How a week lines up with the goals: every sprint task says which goal it
// serves, or that it serves none, and the week adds the hours up per goal.
// Pure and client-safe.

export type SplitTask = { name: string; target_hours: number; goal_id: string | null };

export type GoalShare = { goalId: string; title: string; hours: number; tasks: number };

export type GoalSplit = {
  byGoal: GoalShare[];
  goalHours: number;
  /** Tasks that serve no goal, biggest first: the job, sleep, chores. */
  other: { name: string; hours: number }[];
  otherHours: number;
};

const round = (n: number) => Math.round(n * 10) / 10;

export function goalSplit(tasks: SplitTask[], titleOf: (goalId: string) => string | null): GoalSplit {
  const byGoal = new Map<string, GoalShare>();
  const other: { name: string; hours: number }[] = [];
  for (const t of tasks) {
    const hours = Number(t.target_hours) || 0;
    const title = t.goal_id ? titleOf(t.goal_id) : null;
    if (t.goal_id && title) {
      const share = byGoal.get(t.goal_id) ?? { goalId: t.goal_id, title, hours: 0, tasks: 0 };
      share.hours += hours;
      share.tasks += 1;
      byGoal.set(t.goal_id, share);
    } else {
      other.push({ name: t.name, hours });
    }
  }
  const shares = [...byGoal.values()].map((s) => ({ ...s, hours: round(s.hours) })).sort((a, b) => b.hours - a.hours);
  return {
    byGoal: shares,
    goalHours: round(shares.reduce((sum, s) => sum + s.hours, 0)),
    other: other.sort((a, b) => b.hours - a.hours),
    otherHours: round(other.reduce((sum, o) => sum + o.hours, 0)),
  };
}
