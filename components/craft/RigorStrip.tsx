import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  CHECKLIST,
  CHECKLIST_TOTAL,
  tickedCount,
  type Ticks,
} from "@/lib/craft/checklist";

/** jsonb arrives as Json; keep only the true flags. */
function normaliseTicks(value: unknown): Ticks {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Ticks = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (val === true) out[key] = true;
  }
  return out;
}

/**
 * The open checklist you last touched, shown under the focus timer.
 *
 * Deliberately not tied to the timer's own task picker: that picks sprint
 * tasks, rigor hangs off todo tasks, and forcing them to agree would mean
 * maintaining a mapping nobody asked for. What you want here is a reminder of
 * which stage you are on while you are actually working, and the most recently
 * ticked run is that, reliably.
 *
 * Renders nothing when there is no open run — an empty prompt on the busiest
 * page in the app would just be noise.
 */
export async function RigorStrip({
  supabase,
  ownerId,
}: {
  supabase: SupabaseClient<Database>;
  ownerId: string;
}) {
  const { data } = await supabase
    .from("craft_runs")
    .select("ticks, todo_tasks(title)")
    .eq("owner_id", ownerId)
    .is("completed_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const task = Array.isArray(data.todo_tasks) ? data.todo_tasks[0] : data.todo_tasks;
  const ticks = normaliseTicks(data.ticks);
  const done = tickedCount(ticks);
  const stage = CHECKLIST.find((s) => s.items.some((i) => !ticks[i.id]));

  return (
    <Link
      href="/todo"
      className="mb-5 flex items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors hover:border-primary/50"
    >
      <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate text-foreground">
        {task?.title ?? "Open checklist"}
      </span>
      <span className="shrink-0 tabular-nums text-muted-foreground">
        {done}/{CHECKLIST_TOTAL}
      </span>
      {stage && (
        <span className="hidden shrink-0 text-muted-foreground sm:inline">
          &middot; now: {stage.title.toLowerCase()}
        </span>
      )}
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
