import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient, getUser } from "@/lib/supabase/server";
import { todayIsoLocal } from "@/lib/dates";
import {
  GOAL_AREA_VALUES,
  GOAL_HORIZON_VALUES,
  TRACK_TYPE_VALUES,
  type GoalArea,
  type GoalHorizon,
  type TrackType,
} from "@/lib/goals/constants";
import { GoalForm } from "@/components/goals/GoalForm";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function oneOf<T extends string>(values: readonly T[], value: string, fallback: T): T {
  return (values as readonly string[]).includes(value) ? (value as T) : fallback;
}

export default async function EditGoalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const [{ data: goal }, { data: others }, todayIso] = await Promise.all([
    supabase.from("goals").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle(),
    supabase
      .from("goals")
      .select("id, title")
      .eq("owner_id", user.id)
      .in("status", ["active", "paused"])
      .neq("id", id)
      .order("target_date", { ascending: false }),
    todayIsoLocal(),
  ]);
  if (!goal) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link
        href={`/goals/${goal.id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        {goal.title}
      </Link>

      <h1 className="text-2xl font-bold text-foreground">Edit goal</h1>

      <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <GoalForm
          todayIso={todayIso}
          parentOptions={others ?? []}
          activeCount={0}
          goal={{
            id: goal.id,
            title: goal.title,
            why: goal.why,
            area: oneOf<GoalArea>(GOAL_AREA_VALUES, goal.area, "self"),
            horizon: oneOf<GoalHorizon>(GOAL_HORIZON_VALUES, goal.horizon, "custom"),
            startDate: goal.start_date,
            targetDate: goal.target_date,
            trackType: oneOf<TrackType>(TRACK_TYPE_VALUES, goal.track_type, "feeling"),
            startValue: goal.start_value,
            targetValue: goal.target_value,
            unit: goal.unit,
            parentId: goal.parent_id,
            isPrivate: goal.is_private,
            checkinEveryDays: goal.checkin_every_days,
          }}
        />
      </section>
    </div>
  );
}
