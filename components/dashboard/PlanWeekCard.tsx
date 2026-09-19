import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadLeverSummaries, loadMeasureSummaries } from "@/lib/planning/load";
import { LeverRow } from "@/components/goals/plan/LeverList";

const SHOWN_LEVERS = 6;

/**
 * The plan, brought to the day: this week's actions across every goal (auto
 * ones already counted, the rest one tap), and any number that's due a
 * reading. Renders nothing until a goal has actions or a target.
 */
export async function PlanWeekCard({ ownerId, todayIso, weekStart }: { ownerId: string; todayIso: string; weekStart: string }) {
  const supabase = await createClient();
  const { data: goalRows } = await supabase
    .from("goals")
    .select("id, parent_id, title, status, start_date")
    .eq("owner_id", ownerId);
  const goals = goalRows ?? [];
  const active = goals.filter((g) => g.status === "active");
  if (active.length === 0) return null;

  const [levers, measures] = await Promise.all([
    loadLeverSummaries(supabase, ownerId, active.map((g) => g.id), goals, todayIso, weekStart),
    loadMeasureSummaries(supabase, ownerId, active, todayIso),
  ]);
  const due = [...measures.values()].flat().filter((m) => m.due);
  if (levers.length === 0 && due.length === 0) return null;

  const titleOf = new Map(goals.map((g) => [g.id, g.title]));
  // What still needs doing first; finished ones sink but stay visible.
  const ordered = [...levers].sort((a, b) => Number(a.done >= a.target) - Number(b.done >= b.target));
  const hit = levers.filter((l) => l.done >= l.target).length;

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-semibold text-foreground">Plan this week</h2>
          {levers.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {hit} of {levers.length} {levers.length === 1 ? "action" : "actions"} on target
            </span>
          )}
        </div>
        <Link href="/goals" className="text-xs font-medium text-primary hover:underline">
          Streams &amp; goals
        </Link>
      </div>

      {due.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {due.map((m) => (
            <li key={m.measure.id}>
              <Link
                href={`/goals/${m.measure.goal_id}#plan`}
                className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-foreground hover:bg-amber-500/15"
              >
                <ClipboardList className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
                <span className="min-w-0 flex-1 truncate">
                  Log <span className="font-medium">{m.measure.label}</span>
                </span>
                <span className="shrink-0 truncate text-xs text-muted-foreground">{titleOf.get(m.measure.goal_id)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {levers.length > 0 && (
        <ul className="divide-y divide-border">
          {ordered.slice(0, SHOWN_LEVERS).map((l) => (
            <LeverRow key={l.id} lever={l} goalTitle={titleOf.get(l.goal_id)} />
          ))}
        </ul>
      )}
      {levers.length > SHOWN_LEVERS && (
        <p className="mt-2 text-xs text-muted-foreground">
          And {levers.length - SHOWN_LEVERS} more on your{" "}
          <Link href="/goals" className="font-medium text-primary hover:underline">
            streams
          </Link>
          .
        </p>
      )}
    </section>
  );
}
