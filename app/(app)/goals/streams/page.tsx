import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient, getUser } from "@/lib/supabase/server";
import { GOAL_AREA_VALUES, type GoalArea } from "@/lib/goals/constants";
import { StreamManager } from "@/components/goals/plan/StreamManager";

export default async function StreamsPage() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("streams")
    .select("id, name, area, weekly_hours, weight")
    .eq("owner_id", user.id)
    .is("archived_at", null)
    .order("position")
    .order("created_at");

  const streams = (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    area: ((GOAL_AREA_VALUES as readonly string[]).includes(s.area) ? s.area : "self") as GoalArea,
    weeklyHours: s.weekly_hours === null ? null : Number(s.weekly_hours),
    weight: Number(s.weight),
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/goals" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" />
        Goals
      </Link>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Streams</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          The fronts of your life that run at the same time: a job, a business, a side project, health, money,
          learning. Put each goal in a stream and its hours and progress add up there.
        </p>
      </div>
      <StreamManager streams={streams} />
      <p className="text-sm text-muted-foreground">
        Already have a written plan?{" "}
        <Link href="/goals/plan?mode=import" className="font-medium text-primary hover:underline">
          Import your roadmap
        </Link>{" "}
        and its streams are set up for you.
      </p>
    </div>
  );
}
