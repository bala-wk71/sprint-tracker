import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { NewPageButtons } from "../NewPageButtons";
import { PageHeader } from "../PageHeader";
import { PageWorkspace } from "../PageWorkspace";
import { SeriesView } from "../SeriesView";
import { KindIcon } from "../kinds";
import { ancestorsOf, byOccurrenceDate, canNest, descendantIds } from "../tree";
import { toNoteKind, type NoteKind, type Occurrence } from "../types";

export default async function NoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const [
    { data: page },
    { data: allRows },
    { data: childRows },
    { data: itemRows },
  ] = await Promise.all([
    supabase
      .from("note_pages")
      .select(
        "id, parent_id, title, kind, body, enhanced_body, transcript, meeting_date, attendees"
      )
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle(),
    supabase
      .from("note_pages")
      .select("id, parent_id, title, kind, position, meeting_date, updated_at")
      .eq("owner_id", user.id)
      .eq("is_archived", false)
      .order("position"),
    supabase
      .from("note_pages")
      .select("id, title, kind, meeting_date, updated_at")
      .eq("owner_id", user.id)
      .eq("parent_id", id)
      .eq("is_archived", false)
      .order("position"),
    supabase
      .from("todo_tasks")
      .select("id, title, is_completed, due_date, position")
      .eq("owner_id", user.id)
      .eq("source_page_id", id)
      .order("position"),
  ]);

  if (!page) notFound();

  const kind: NoteKind = toNoteKind(page.kind);
  const rows = (allRows ?? []).map((row) => ({
    ...row,
    kind: toNoteKind(row.kind),
  }));
  const breadcrumb = ancestorsOf(rows, id).map((row) => ({
    id: row.id,
    title: row.title,
  }));

  // A page cannot be moved into its own subtree, and the kind rules rule out
  // more: a meeting takes no children, a series takes only meetings. Both are
  // re-checked server-side — this just keeps the impossible off the menu.
  const blocked = descendantIds(rows, id);
  const moveTargets = rows
    .filter((row) => !blocked.has(row.id) && canNest(kind, row.kind))
    .map((row) => ({
      id: row.id,
      label: [...ancestorsOf(rows, row.id).map((a) => a.title), row.title].join(
        " › "
      ),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const children = childRows ?? [];
  const descendantCount = blocked.size - 1;

  const header = (
    <PageHeader
      pageId={page.id}
      title={page.title}
      kind={kind}
      meetingDate={page.meeting_date}
      attendees={page.attendees}
      breadcrumb={breadcrumb}
      parentId={page.parent_id}
      moveTargets={moveTargets}
      descendantCount={descendantCount}
    />
  );

  // ---- Series: a shelf of sittings, with no notes of its own. ----
  if (kind === "series") {
    const occurrenceIds = children.map((child) => child.id);
    const { data: seriesItems } = occurrenceIds.length
      ? await supabase
          .from("todo_tasks")
          .select("source_page_id, is_completed")
          .eq("owner_id", user.id)
          .in("source_page_id", occurrenceIds)
      : { data: null };

    const counts = new Map<string, { open: number; total: number }>();
    for (const item of seriesItems ?? []) {
      if (!item.source_page_id) continue;
      const entry = counts.get(item.source_page_id) ?? { open: 0, total: 0 };
      entry.total += 1;
      if (!item.is_completed) entry.open += 1;
      counts.set(item.source_page_id, entry);
    }

    const occurrences: Occurrence[] = children
      .map((child) => ({
        id: child.id,
        title: child.title,
        meeting_date: child.meeting_date,
        updated_at: child.updated_at,
        openItems: counts.get(child.id)?.open ?? 0,
        totalItems: counts.get(child.id)?.total ?? 0,
      }))
      .sort(byOccurrenceDate);

    return (
      <div className="space-y-4">
        {header}
        <SeriesView seriesId={page.id} occurrences={occurrences} />
      </div>
    );
  }

  // ---- Meeting: one sitting, and a leaf. Nothing nests inside it. ----
  // ---- Page: a document, which still holds anything.               ----
  const subpages =
    kind === "meeting" ? null : (
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Subpages</h2>
        {children.length > 0 && (
          <ul className="space-y-1">
            {children.map((child) => {
              return (
                <li key={child.id}>
                  <Link
                    href={`/notes/${child.id}`}
                    className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <KindIcon
                      kind={toNoteKind(child.kind)}
                      className="h-4 w-4 shrink-0"
                    />
                    <span className="truncate">{child.title}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <NewPageButtons parentId={page.id} parentKind={kind} />
      </section>
    );

  return (
    <div className="space-y-4">
      {header}
      <PageWorkspace
        pageId={page.id}
        body={page.body}
        enhancedBody={page.enhanced_body}
        transcript={page.transcript}
        items={itemRows ?? []}
        subpages={subpages}
      />
    </div>
  );
}
