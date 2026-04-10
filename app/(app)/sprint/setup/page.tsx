import Link from "next/link";
import { format, startOfWeek } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { CreateSprintForm } from "./CreateSprintForm";

export default async function SprintSetupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // (app)/layout.tsx already redirects unauthenticated users; this is just for TS.
  if (!user) return null;

  const { data: sprints } = await supabase
    .from("sprints")
    .select("id, week_start_date, notes, created_at, tasks(count)")
    .eq("owner_id", user.id)
    .order("week_start_date", { ascending: false });

  const defaultWeekStart = format(
    startOfWeek(new Date(), { weekStartsOn: 1 }),
    "yyyy-MM-dd"
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Sprint Setup</h1>
        <p className="text-muted-foreground">
          Plan your week. Set tasks, categories, and hour targets.
        </p>
      </div>

      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Create a new sprint
        </h2>
        <CreateSprintForm defaultWeekStart={defaultWeekStart} />
      </section>

      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Your sprints</h2>
        {sprints && sprints.length > 0 ? (
          <ul className="divide-y divide-border">
            {sprints.map((sprint) => {
              const taskCount = sprint.tasks?.[0]?.count ?? 0;
              return (
                <li key={sprint.id} className="flex items-center justify-between py-3">
                  <div>
                    <Link
                      href={`/sprint/${sprint.id}`}
                      className="text-sm font-medium text-foreground hover:text-primary"
                    >
                      Week of {format(new Date(sprint.week_start_date), "MMM d, yyyy")}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {taskCount} {taskCount === 1 ? "task" : "tasks"}
                      {sprint.notes ? ` · ${sprint.notes}` : ""}
                    </p>
                  </div>
                  <Link
                    href={`/sprint/${sprint.id}`}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Open →
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No sprints yet. Create your first one above.
          </p>
        )}
      </section>
    </div>
  );
}
