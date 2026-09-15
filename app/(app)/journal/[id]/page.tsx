import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ChevronLeft } from "lucide-react";
import { createClient, getUser } from "@/lib/supabase/server";
import { todayIsoLocal } from "@/lib/dates";
import { toJournalMood } from "@/lib/journal/constants";
import { JournalComposer } from "@/components/journal/JournalComposer";
import { Markdown } from "@/components/shared/Markdown";
import { loadComments } from "@/components/comments/loadComments";
import { CommentThread } from "@/components/comments/CommentThread";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function JournalEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const [{ data: entry }, todayIso, comments] = await Promise.all([
    supabase
      .from("journal_entries")
      .select("id, entry_date, title, body, mood, author, is_private, hide_from_coach")
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle(),
    todayIsoLocal(),
    loadComments("journal_entry", id),
  ]);
  if (!entry) notFound();

  const fromCoach = entry.author === "coach";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link
        href="/journal"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Journal
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {fromCoach ? "Coach look-back" : "Journal entry"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {format(new Date(`${entry.entry_date}T00:00:00`), "EEEE, d MMMM yyyy")}
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
        {fromCoach ? (
          <div className="space-y-2 text-sm leading-relaxed text-foreground">
            {entry.title && <p className="font-medium">{entry.title}</p>}
            <Markdown content={entry.body} />
          </div>
        ) : (
          <JournalComposer
            todayIso={todayIso}
            entry={{
              id: entry.id,
              title: entry.title,
              body: entry.body,
              mood: toJournalMood(entry.mood),
              entryDate: entry.entry_date,
              isPrivate: entry.is_private,
              hideFromCoach: entry.hide_from_coach,
            }}
          />
        )}
      </section>

      {!fromCoach && !entry.is_private && (
        <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Comments from your reviewers</h2>
          <CommentThread
            targetType="journal_entry"
            targetId={entry.id}
            ownerId={user.id}
            currentUserId={user.id}
            initialComments={comments}
            revalidatePaths={[`/journal/${entry.id}`]}
          />
        </section>
      )}
    </div>
  );
}
