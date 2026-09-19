import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient, getUser } from "@/lib/supabase/server";
import { todayIsoLocal } from "@/lib/dates";
import { SPECIALISTS, type Specialist } from "@/lib/planning/constants";
import { PlanWorkbench } from "@/components/goals/plan/draft/PlanWorkbench";

// Reading a full roadmap takes the AI about a minute; give it room.
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AREA_SPECIALIST: Record<string, Specialist> = {
  health: "health",
  work: "business",
  money: "business",
  learning: "skills",
};

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; goal?: string; with?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const [{ data: streams }, todayIso, { data: goal }] = await Promise.all([
    supabase.from("streams").select("name").eq("owner_id", user.id).is("archived_at", null).order("position"),
    todayIsoLocal(),
    params.goal && UUID.test(params.goal)
      ? supabase.from("goals").select("id, title, area").eq("id", params.goal).eq("owner_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const requested = SPECIALISTS.find((s) => s.value === params.with)?.value;
  const specialist = requested ?? (goal ? AREA_SPECIALIST[goal.area] : undefined) ?? "health";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href={goal ? `/goals/${goal.id}` : "/goals"}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        {goal ? goal.title : "Goals"}
      </Link>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">{goal ? "Plan this goal" : "Plan"}</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Work out a target and the path to it with a coach, or bring in a roadmap you&apos;ve already written.
          You see everything before it&apos;s saved.
        </p>
      </div>
      <PlanWorkbench
        initialMode={params.mode === "import" ? "import" : "coach"}
        initialSpecialist={specialist}
        todayIso={todayIso}
        existingStreams={(streams ?? []).map((s) => s.name)}
        goal={goal ? { id: goal.id, title: goal.title } : null}
      />
    </div>
  );
}
