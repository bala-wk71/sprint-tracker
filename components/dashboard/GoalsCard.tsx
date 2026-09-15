import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { goalArea, horizonLabel } from "@/lib/goals/constants";
import {
  formatValue,
  goalProgress,
  isCheckinDue,
  isPastEnd,
  nextCheckinLabel,
  timeLeftLabel,
} from "@/lib/goals/progress";

type Props = {
  ownerId: string;
  todayIso: string;
};

const SHOWN = 3;
/** Past this many steps the segments get too thin to read, so it becomes one bar. */
const MAX_SEGMENTS = 20;
const RECENT_RATINGS = 4;

export async function GoalsCard({ ownerId, todayIso }: Props) {
  const supabase = await createClient();

  const [{ data: goalRows }, { count: activeCount }] = await Promise.all([
    supabase
      .from("goals")
      .select(
        "id, title, area, horizon, status, start_date, target_date, track_type, start_value, target_value, current_value, unit, checkin_every_days, last_checkin_on, goal_steps(done_at)"
      )
      .eq("owner_id", ownerId)
      .eq("status", "active")
      .order("pinned", { ascending: false })
      .order("target_date", { ascending: true })
      .limit(SHOWN),
    supabase
      .from("goals")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId)
      .eq("status", "active"),
  ]);
  const goals = goalRows ?? [];

  // Last few ratings for every feeling goal on the card, in one query.
  const feelingIds = goals.filter((g) => g.track_type === "feeling").map((g) => g.id);
  const ratings = new Map<string, number[]>();
  if (feelingIds.length > 0) {
    const { data: checkins } = await supabase
      .from("journal_entries")
      .select("goal_id, on_track")
      .in("goal_id", feelingIds)
      .not("on_track", "is", null)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(feelingIds.length * 25);
    for (const c of checkins ?? []) {
      if (!c.goal_id || c.on_track === null) continue;
      const list = ratings.get(c.goal_id) ?? [];
      if (list.length < RECENT_RATINGS) list.push(c.on_track);
      ratings.set(c.goal_id, list);
    }
  }

  const total = activeCount ?? goals.length;

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-semibold text-foreground">Goals</h2>
          {total > 0 && (
            <span className="text-xs text-muted-foreground">
              {total > goals.length ? `${goals.length} of ${total} active` : `${total} active`}
            </span>
          )}
        </div>
        <Link href="/goals" className="text-xs font-medium text-primary hover:underline">
          All goals
        </Link>
      </div>

      {goals.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Set a goal that&apos;s bigger than this week.{" "}
          <Link href="/goals/new" className="font-medium text-primary hover:underline">
            Add a goal
          </Link>
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {goals.map((goal) => {
            const steps = goal.goal_steps ?? [];
            const stepsDone = steps.filter((s) => s.done_at).length;
            // Newest first from the query; bars read oldest → newest.
            const recent = [...(ratings.get(goal.id) ?? [])].reverse();
            const progress = goalProgress(goal, {
              stepsDone,
              stepsTotal: steps.length,
              lastFeeling: recent.at(-1) ?? null,
            });
            const due = isCheckinDue(goal, todayIso);
            const pastEnd = isPastEnd(goal, todayIso);

            return (
              <li key={goal.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <span
                  aria-hidden
                  className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${goalArea(goal.area).dot}`}
                />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Link
                    href={`/goals/${goal.id}`}
                    className="block break-words font-medium text-foreground hover:underline"
                  >
                    {goal.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {horizonLabel(goal.horizon, goal.start_date, goal.target_date)} ·{" "}
                    {timeLeftLabel(goal.target_date, todayIso)} ·{" "}
                    {nextCheckinLabel(goal, todayIso)}
                  </p>

                  {goal.track_type === "steps" && (
                    <Progress
                      label={
                        steps.length > 0
                          ? `${stepsDone} of ${steps.length} ${steps.length === 1 ? "step" : "steps"}`
                          : "No steps yet"
                      }
                    >
                      {steps.length > 0 && steps.length <= MAX_SEGMENTS ? (
                        <div className="flex h-1.5 gap-0.5">
                          {steps.map((_, i) => (
                            <span
                              key={i}
                              className={`flex-1 rounded-full ${i < stepsDone ? "bg-primary" : "bg-muted"}`}
                            />
                          ))}
                        </div>
                      ) : (
                        <Bar value={progress} />
                      )}
                    </Progress>
                  )}

                  {goal.track_type === "number" && (
                    <Progress
                      label={`${formatValue(goal.current_value ?? goal.start_value, null)} of ${formatValue(goal.target_value, goal.unit)}`}
                    >
                      <Bar value={progress} />
                    </Progress>
                  )}

                  {goal.track_type === "feeling" && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {recent.length > 0 && (
                        <div className="flex h-4 items-end gap-0.5" aria-hidden>
                          {recent.map((r, i) => (
                            <span
                              key={i}
                              className="w-1.5 rounded-sm bg-primary"
                              style={{ height: `${Math.max(10, r * 10)}%` }}
                            />
                          ))}
                        </div>
                      )}
                      <span>
                        {recent.length > 0 ? `Feels ${recent.at(-1)} of 10` : "No check-ins yet"}
                      </span>
                    </div>
                  )}
                </div>

                {due ? (
                  <Link
                    href={`/goals/${goal.id}#check-in`}
                    className="shrink-0 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Check in
                  </Link>
                ) : pastEnd ? (
                  <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                    Past end date
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Progress({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 max-w-48 flex-1">{children}</div>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{label}</span>
    </div>
  );
}

function Bar({ value }: { value: number | null }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((value ?? 0) * 100)}%` }} />
    </div>
  );
}
