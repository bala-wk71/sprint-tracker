import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  MORNING_MOODS,
  EVENING_MOODS,
  PRIORITY_STATUSES,
  type TaskCategory,
  type MorningMood,
  type EveningMood,
  type PriorityStatus,
} from "@/lib/constants";
import { CategoryBadge } from "@/components/sprint/CategoryBadge";
import { CommentThread } from "@/components/comments/CommentThread";
import { loadComments } from "@/components/comments/loadComments";

type RouteParams = Promise<{ ownerId: string; date: string }>;

function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

const MORNING_LOOKUP = Object.fromEntries(
  MORNING_MOODS.map((m) => [m.value, m])
) as Record<MorningMood, (typeof MORNING_MOODS)[number]>;

const EVENING_LOOKUP = Object.fromEntries(
  EVENING_MOODS.map((m) => [m.value, m])
) as Record<EveningMood, (typeof EVENING_MOODS)[number]>;

const PRIORITY_LOOKUP = Object.fromEntries(
  PRIORITY_STATUSES.map((p) => [p.value, p])
) as Record<PriorityStatus, (typeof PRIORITY_STATUSES)[number]>;

export default async function ReviewDailyPage({
  params,
}: {
  params: RouteParams;
}) {
  const { ownerId, date } = await params;

  if (!isValidIsoDate(date)) notFound();

  const supabase = await createClient();
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();
  if (!viewer) return null;

  // Verify the reviewer relationship.
  const { data: relationship } = await supabase
    .from("reviewer_relationships")
    .select(
      "owner_id, owner:users!reviewer_relationships_owner_id_fkey(id, full_name, email)"
    )
    .eq("reviewer_id", viewer.id)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (!relationship) notFound();

  const owner = relationship.owner as {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
  const ownerName = owner?.full_name || owner?.email || "Owner";

  // Load the daily log. RLS allows reviewer to see it (but private
  // reflection/gratitude columns still need app-level blanking).
  const { data: dailyLog } = await supabase
    .from("daily_logs")
    .select(
      "id, morning_mood, morning_energy, daily_intention, closing_mood, productivity_rating, reflection, reflection_private, improvement, win, gratitude, gratitude_private"
    )
    .eq("owner_id", ownerId)
    .eq("log_date", date)
    .maybeSingle();

  let priorityRows: Array<{
    id: string;
    position: number;
    description: string;
    target_hours: number;
    status: PriorityStatus;
  }> = [];
  let entryRows: Array<{
    id: string;
    start_time: string | null;
    duration_hours: number;
    energy_during: number | null;
    notes: string | null;
    task_name: string | null;
    task_category: TaskCategory | null;
  }> = [];

  if (dailyLog) {
    const { data: prios } = await supabase
      .from("priorities")
      .select("id, position, description, target_hours, status")
      .eq("daily_log_id", dailyLog.id)
      .order("position", { ascending: true });

    priorityRows = (prios ?? []).map((p) => ({
      id: p.id,
      position: p.position,
      description: p.description,
      target_hours: Number(p.target_hours),
      status: p.status as PriorityStatus,
    }));

    // RLS filters out time_entries where is_private=true for reviewers.
    const { data: entries } = await supabase
      .from("time_entries")
      .select(
        "id, start_time, duration_hours, energy_during, notes, tasks(name, category)"
      )
      .eq("daily_log_id", dailyLog.id)
      .order("start_time", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    entryRows = (entries ?? []).map((row) => {
      const task = Array.isArray(row.tasks) ? row.tasks[0] : row.tasks;
      return {
        id: row.id,
        start_time: row.start_time,
        duration_hours: Number(row.duration_hours),
        energy_during: row.energy_during,
        notes: row.notes,
        task_name: task?.name ?? null,
        task_category: (task?.category ?? null) as TaskCategory | null,
      };
    });
  }

  const dayComments = dailyLog
    ? await loadComments("daily_log", dailyLog.id)
    : [];

  const totalHours = entryRows.reduce((sum, e) => sum + e.duration_hours, 0);
  const morningMoodInfo = dailyLog?.morning_mood
    ? MORNING_LOOKUP[dailyLog.morning_mood as MorningMood]
    : null;
  const eveningMoodInfo = dailyLog?.closing_mood
    ? EVENING_LOOKUP[dailyLog.closing_mood as EveningMood]
    : null;

  // App-level privacy blanking for columns RLS can't hide.
  const reflectionHidden = dailyLog?.reflection_private === true;
  const gratitudeHidden = dailyLog?.gratitude_private === true;

  const displayDate = format(new Date(`${date}T00:00:00`), "EEEE, MMM d, yyyy");
  const currentPath = `/review/${ownerId}/daily/${date}`;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/review/${ownerId}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to {ownerName}&apos;s week
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-foreground">{displayDate}</h1>
        <p className="text-muted-foreground">
          Read-only review of {ownerName}&apos;s day.
        </p>
      </div>

      {!dailyLog ? (
        <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
          <p className="text-sm text-muted-foreground">
            No log recorded for this day.
          </p>
        </div>
      ) : (
        <>
          {/* Morning */}
          <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-foreground">
              Morning check-in
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <ReadField label="Mood">
                {morningMoodInfo ? (
                  <span className="flex items-center gap-2">
                    <span className="text-lg">{morningMoodInfo.emoji}</span>
                    <span>{morningMoodInfo.label}</span>
                  </span>
                ) : (
                  <EmptyValue />
                )}
              </ReadField>
              <ReadField label="Energy">
                {dailyLog.morning_energy !== null ? (
                  `${dailyLog.morning_energy}/10`
                ) : (
                  <EmptyValue />
                )}
              </ReadField>
              <div className="sm:col-span-2">
                <ReadField label="Daily intention">
                  {dailyLog.daily_intention ? (
                    <span className="whitespace-pre-wrap">
                      {dailyLog.daily_intention}
                    </span>
                  ) : (
                    <EmptyValue />
                  )}
                </ReadField>
              </div>
            </div>

            {priorityRows.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Top priorities
                </p>
                <ul className="space-y-1.5">
                  {priorityRows.map((p) => {
                    const info = PRIORITY_LOOKUP[p.status];
                    return (
                      <li
                        key={p.id}
                        className="flex items-start gap-2 text-sm text-foreground"
                      >
                        <span>{info?.emoji ?? "•"}</span>
                        <span className="flex-1">
                          <span className="font-medium">{p.description}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {p.target_hours.toFixed(1)}h target · {info?.label}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>

          {/* Time entries */}
          <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                Time entries
              </h2>
              <span className="text-sm text-muted-foreground">
                {totalHours.toFixed(1)}h total
              </span>
            </div>
            {entryRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No visible time entries. Private entries are hidden.
              </p>
            ) : (
              <ul className="space-y-2">
                {entryRows.map((e) => (
                  <li
                    key={e.id}
                    className="rounded-md border border-border bg-background p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {e.task_category && (
                          <CategoryBadge category={e.task_category} />
                        )}
                        <span className="font-medium text-foreground">
                          {e.task_name ?? "(untagged)"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {e.start_time && (
                          <span>{e.start_time.slice(0, 5)}</span>
                        )}
                        <span>{e.duration_hours.toFixed(1)}h</span>
                        {e.energy_during !== null && (
                          <span>energy {e.energy_during}/5</span>
                        )}
                      </div>
                    </div>
                    {e.notes && (
                      <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                        {e.notes}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Evening */}
          <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-foreground">
              Evening wrap-up
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <ReadField label="Closing mood">
                {eveningMoodInfo ? (
                  <span className="flex items-center gap-2">
                    <span className="text-lg">{eveningMoodInfo.emoji}</span>
                    <span>{eveningMoodInfo.label}</span>
                  </span>
                ) : (
                  <EmptyValue />
                )}
              </ReadField>
              <ReadField label="Productivity">
                {dailyLog.productivity_rating !== null ? (
                  `${dailyLog.productivity_rating}/10`
                ) : (
                  <EmptyValue />
                )}
              </ReadField>
              <ReadField label="Reflection">
                {reflectionHidden ? (
                  <PrivateNote />
                ) : dailyLog.reflection ? (
                  <span className="whitespace-pre-wrap">{dailyLog.reflection}</span>
                ) : (
                  <EmptyValue />
                )}
              </ReadField>
              <ReadField label="Improvement">
                {dailyLog.improvement ? (
                  <span className="whitespace-pre-wrap">{dailyLog.improvement}</span>
                ) : (
                  <EmptyValue />
                )}
              </ReadField>
              <ReadField label="Win">
                {dailyLog.win ? (
                  <span className="whitespace-pre-wrap">{dailyLog.win}</span>
                ) : (
                  <EmptyValue />
                )}
              </ReadField>
              <ReadField label="Gratitude">
                {gratitudeHidden ? (
                  <PrivateNote />
                ) : dailyLog.gratitude ? (
                  <span className="whitespace-pre-wrap">{dailyLog.gratitude}</span>
                ) : (
                  <EmptyValue />
                )}
              </ReadField>
            </div>
          </section>

          {/* Comments */}
          <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-foreground">
              Feedback
            </h2>
            <CommentThread
              targetType="daily_log"
              targetId={dailyLog.id}
              ownerId={ownerId}
              currentUserId={viewer.id}
              initialComments={dayComments}
              revalidatePaths={[currentPath]}
            />
          </section>
        </>
      )}
    </div>
  );
}

function ReadField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

function EmptyValue() {
  return <span className="italic text-muted-foreground">Not set</span>;
}

function PrivateNote() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border bg-background px-2 py-1 text-xs italic text-muted-foreground">
      <Lock className="h-3 w-3" />
      Private note
    </span>
  );
}
