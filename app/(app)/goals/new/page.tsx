import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient, getUser } from "@/lib/supabase/server";
import { todayIsoLocal } from "@/lib/dates";
import { GoalForm } from "@/components/goals/GoalForm";

export default async function NewGoalPage({
  searchParams,
}: {
  searchParams: Promise<{ parent?: string }>;
}) {
  const { parent } = await searchParams;
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const [{ data }, todayIso] = await Promise.all([
    supabase
      .from("goals")
      .select("id, title, status")
      .eq("owner_id", user.id)
      .in("status", ["active", "paused"])
      .order("target_date", { ascending: false }),
    todayIsoLocal(),
  ]);
  const options = data ?? [];
  const parentGoal = options.find((g) => g.id === parent) ?? null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link
        href={parentGoal ? `/goals/${parentGoal.id}` : "/goals"}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        {parentGoal ? parentGoal.title : "Goals"}
      </Link>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">
          {parentGoal ? "Add a smaller goal" : "New goal"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {parentGoal
            ? `One step toward “${parentGoal.title}”. What could you do in the next few months?`
            : "Something you want to reach that's bigger than one week."}
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <GoalForm
          todayIso={todayIso}
          parentOptions={options.map(({ id, title }) => ({ id, title }))}
          activeCount={options.filter((g) => g.status === "active").length}
          initialParentId={parentGoal?.id ?? null}
        />
      </section>
    </div>
  );
}
