import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient, getUser } from "@/lib/supabase/server";
import { todayIsoLocal } from "@/lib/dates";
import { getReviewedOwner } from "@/lib/reviewAccess";
import { goalArea, horizonLabel } from "@/lib/goals/constants";
import { timeLeftLabel } from "@/lib/goals/progress";
import { loadComments } from "@/components/comments/loadComments";
import { CommentThread } from "@/components/comments/CommentThread";
import { GoalProgressBar } from "@/components/goals/GoalProgressBar";
import { GoalStatusChip } from "@/components/goals/GoalStatusChip";
import { CheckInHistory } from "@/components/goals/CheckInHistory";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CARD = "rounded-xl border border-border bg-card p-4 sm:p-6";

export default async function ReviewGoalPage({
  params,
}: {
  params: Promise<{ ownerId: string; goalId: string }>;
}) {
  const { ownerId, goalId } = await params;
  if (!UUID.test(ownerId) || !UUID.test(goalId)) notFound();

  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const owner = await getReviewedOwner(supabase, user.id, ownerId);
  if (!owner) notFound();

  const path = `/review/${ownerId}/goals/${goalId}`;
  const [{ data: goal }, { data: steps }, { data: entries }, comments, todayIso] = await Promise.all([
    // RLS returns nothing for a private goal, which becomes a 404 below.
    supabase.from("goals").select("*").eq("id", goalId).eq("owner_id", ownerId).maybeSingle(),
    supabase.from("goal_steps").select("id, title, done_at").eq("goal_id", goalId).order("position"),
    supabase
      .from("journal_entries")
      .select("id, entry_date, title, body, kind, on_track, value")
      .eq("goal_id", goalId)
      .eq("owner_id", ownerId)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(60),
    loadComments("goal", goalId),
    todayIsoLocal(),
  ]);
  if (!goal) notFound();

  const stepRows = steps ?? [];
  const history = entries ?? [];
  const area = goalArea(goal.area);
  const closed = goal.status === "done" || goal.status === "let_go";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={`/review/${ownerId}`}
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to {owner.name}
      </Link>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", area.dot)} aria-hidden />
            {area.label}
          </span>
          <span>{horizonLabel(goal.horizon, goal.start_date, goal.target_date)}</span>
          <span>
            Ends {format(new Date(`${goal.target_date}T00:00:00`), "d MMM yyyy")}
            {!closed && ` · ${timeLeftLabel(goal.target_date, todayIso)}`}
          </span>
          <GoalStatusChip status={goal.status} />
        </div>
        <h1 className="text-balance text-2xl font-bold text-foreground">{goal.title}</h1>
        {goal.why && <p className="max-w-prose text-sm leading-relaxed text-foreground/80">{goal.why}</p>}
      </header>

      <section className={CARD}>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Progress</h2>
        <GoalProgressBar
          trackType={goal.track_type}
          startValue={goal.start_value}
          targetValue={goal.target_value}
          currentValue={goal.current_value}
          unit={goal.unit}
          stepsDone={stepRows.filter((s) => s.done_at).length}
          stepsTotal={stepRows.length}
          feelings={history.flatMap((e) => (e.on_track === null ? [] : [e.on_track]))}
        />
        {stepRows.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {stepRows.map((step) => (
              <li key={step.id} className="flex items-center gap-2 text-sm">
                {step.done_at ? (
                  <Check className="h-4 w-4 shrink-0 text-primary" aria-label="Done" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Not done" />
                )}
                <span className={step.done_at ? "text-muted-foreground line-through" : "text-foreground"}>
                  {step.title}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CheckInHistory entries={history} unit={goal.unit} readOnly />

      <section className={CARD}>
        <h2 className="mb-1 text-lg font-semibold text-foreground">Comments</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          {owner.name} sees these on their goal page.
        </p>
        <CommentThread
          targetType="goal"
          targetId={goal.id}
          ownerId={ownerId}
          currentUserId={user.id}
          initialComments={comments}
          revalidatePaths={[path]}
        />
      </section>
    </div>
  );
}
