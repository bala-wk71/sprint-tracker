import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, Target } from "lucide-react";
import { createClient, getUser } from "@/lib/supabase/server";
import { getReviewedOwner } from "@/lib/reviewAccess";
import { JOURNAL_MOODS } from "@/lib/journal/constants";
import { formatValue } from "@/lib/goals/progress";
import { Markdown } from "@/components/shared/Markdown";
import { loadComments } from "@/components/comments/loadComments";
import { CommentThread } from "@/components/comments/CommentThread";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMIT = 20;

export default async function ReviewJournalPage({
  params,
}: {
  params: Promise<{ ownerId: string }>;
}) {
  const { ownerId } = await params;
  if (!UUID.test(ownerId)) notFound();

  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const owner = await getReviewedOwner(supabase, user.id, ownerId);
  if (!owner) notFound();

  // RLS returns only entries the owner chose to share.
  const { data } = await supabase
    .from("journal_entries")
    .select("id, entry_date, title, body, kind, mood, on_track, value, goal_id, goals(title, unit)")
    .eq("owner_id", ownerId)
    .in("kind", ["entry", "check_in"])
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  const entries = data ?? [];
  const threads = await Promise.all(entries.map((e) => loadComments("journal_entry", e.id)));
  const path = `/review/${ownerId}/journal`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={`/review/${ownerId}`}
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to {owner.name}
      </Link>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Shared journal entries</h1>
        <p className="text-sm text-muted-foreground">
          The entries and check-ins {owner.name} chose to share, newest first.
          Anything marked private never shows up here.
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nothing shared yet.
        </p>
      ) : (
        <ul className="space-y-4">
          {entries.map((entry, i) => {
            const mood = JOURNAL_MOODS.find((m) => m.value === entry.mood);
            const goal = Array.isArray(entry.goals) ? entry.goals[0] : entry.goals;
            return (
              <li key={entry.id} className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-6">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-medium tabular-nums text-foreground">
                    {format(new Date(`${entry.entry_date}T00:00:00`), "EEE d MMM yyyy")}
                  </span>
                  <span>{entry.kind === "check_in" ? "Goal check-in" : "Journal"}</span>
                  {mood && (
                    <span role="img" aria-label={`Mood: ${mood.label}`} title={mood.label}>
                      {mood.emoji}
                    </span>
                  )}
                  {goal && entry.goal_id && (
                    <Link
                      href={`/review/${ownerId}/goals/${entry.goal_id}`}
                      className="inline-flex max-w-full items-center gap-1 rounded-full border border-border px-2 py-0.5 font-medium text-foreground hover:border-primary"
                    >
                      <Target className="h-3 w-3 shrink-0 text-primary" />
                      <span className="truncate">{goal.title}</span>
                    </Link>
                  )}
                  {entry.on_track !== null && <span>Feels {entry.on_track}/10</span>}
                  {entry.value !== null && <span>{formatValue(entry.value, goal?.unit ?? null)}</span>}
                </div>
                {entry.title && entry.kind !== "check_in" && (
                  <p className="font-medium text-foreground">{entry.title}</p>
                )}
                <div className="text-sm leading-relaxed text-foreground">
                  <Markdown content={entry.body} />
                </div>
                <div className="border-t border-border pt-3">
                  <CommentThread
                    targetType="journal_entry"
                    targetId={entry.id}
                    ownerId={ownerId}
                    currentUserId={user.id}
                    initialComments={threads[i]}
                    revalidatePaths={[path]}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {entries.length === LIMIT && (
        <p className="text-center text-xs text-muted-foreground">Showing the latest {LIMIT} shared entries.</p>
      )}
    </div>
  );
}
