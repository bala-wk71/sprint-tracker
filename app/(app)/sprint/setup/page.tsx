import Link from "next/link";
import { format, startOfWeek } from "date-fns";
import { ChevronRight } from "lucide-react";
import { createClient, getUser } from "@/lib/supabase/server";
import { CreateSprintForm } from "./CreateSprintForm";
import { UseAsTemplateButton } from "./UseAsTemplateButton";

export default async function SprintSetupPage() {
  const supabase = await createClient();
  const user = await getUser();

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

      <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Create a new sprint
        </h2>
        <CreateSprintForm defaultWeekStart={defaultWeekStart} />
      </section>

      <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Your sprints</h2>
        {sprints && sprints.length > 0 ? (
          <ul className="divide-y divide-border">
            {sprints.map((sprint) => {
              const taskCount = sprint.tasks?.[0]?.count ?? 0;
              return (
                <li key={sprint.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
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
                  <div className="flex items-center gap-2">
                    <UseAsTemplateButton
                      templateSprintId={sprint.id}
                      defaultWeekStart={defaultWeekStart}
                    />
                    <Link
                      href={`/sprint/${sprint.id}`}
                      className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
                    >
                      Open
                      <ChevronRight className="h-3 w-3" />
                    </Link>
                  </div>
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
