import Link from "next/link";
import { NotebookPen } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { todayIsoLocal } from "@/lib/dates";
import { GoalRow, type GoalRowData } from "./GoalRow";

type Row = GoalRowData & { goal_steps: { done_at: string | null }[] };

/**
 * The goals someone shares with their reviewers. RLS returns only goals not
 * marked private, so nothing here needs filtering in the app.
 */
export async function ReviewGoalsSection({ ownerId }: { ownerId: string }) {
  const supabase = await createClient();

  const [{ data }, { count: sharedEntries }, todayIso] = await Promise.all([
    supabase
      .from("goals")
      .select(
        "id, title, area, horizon, start_date, target_date, track_type, start_value, target_value, current_value, unit, status, pinned, is_private, checkin_every_days, last_checkin_on, completed_at, goal_steps(done_at)"
      )
      .eq("owner_id", ownerId)
      .in("status", ["active", "paused"])
      .order("pinned", { ascending: false })
      .order("target_date", { ascending: true }),
    supabase
      .from("journal_entries")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId)
      .eq("is_private", false),
    todayIsoLocal(),
  ]);
  const goals: Row[] = data ?? [];

  const feelingIds = goals.filter((g) => g.track_type === "feeling").map((g) => g.id);
  const { data: ratings } = feelingIds.length
    ? await supabase
        .from("journal_entries")
        .select("goal_id, on_track")
        .in("goal_id", feelingIds)
        .not("on_track", "is", null)
        .order("entry_date", { ascending: false })
        .limit(200)
    : { data: [] };
  const feelings = new Map<string, number[]>();
  for (const r of ratings ?? []) {
    if (!r.goal_id || r.on_track === null) continue;
    const list = feelings.get(r.goal_id) ?? [];
    if (list.length < 6) list.push(r.on_track);
    feelings.set(r.goal_id, list);
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Goals</h2>
          <p className="text-xs text-muted-foreground">
            What they&apos;re working toward beyond this week. Private goals stay hidden.
          </p>
        </div>
        {(sharedEntries ?? 0) > 0 && (
          <Link
            href={`/review/${ownerId}/journal`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <NotebookPen className="h-3.5 w-3.5" />
            Shared journal entries ({sharedEntries})
          </Link>
        )}
      </div>

      {goals.length === 0 ? (
        <p className="text-sm text-muted-foreground">No shared goals yet.</p>
      ) : (
        <ul className="-mx-4 divide-y divide-border border-t border-border sm:-mx-6">
          {goals.map((g) => (
            <GoalRow
              key={g.id}
              goal={g}
              stepsDone={g.goal_steps.filter((s) => s.done_at).length}
              stepsTotal={g.goal_steps.length}
              feelings={feelings.get(g.id) ?? []}
              parentTitle={null}
              todayIso={todayIso}
              hrefBase={`/review/${ownerId}/goals`}
              readOnly
            />
          ))}
        </ul>
      )}
    </section>
  );
}
