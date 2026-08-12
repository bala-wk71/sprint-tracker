import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, FileText } from "lucide-react";
import { createClient, getUser } from "@/lib/supabase/server";
import { NewPageButtons } from "../NewPageButtons";
import { PageHeader } from "../PageHeader";
import { PageWorkspace } from "../PageWorkspace";
import { ancestorsOf, descendantIds } from "../tree";
import type { NoteKind } from "../types";

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
      .select("id, parent_id, title, kind, position, updated_at")
      .eq("owner_id", user.id)
      .order("position"),
    supabase
      .from("note_pages")
      .select("id, title, kind")
      .eq("owner_id", user.id)
      .eq("parent_id", id)
      .order("position"),
    supabase
      .from("todo_tasks")
      .select("id, title, is_completed, due_date, position")
      .eq("owner_id", user.id)
      .eq("source_page_id", id)
      .order("position"),
  ]);

  if (!page) notFound();

  const rows = (allRows ?? []).map((row) => ({
    ...row,
    kind: (row.kind === "meeting" ? "meeting" : "page") as NoteKind,
  }));
  const breadcrumb = ancestorsOf(rows, id).map((row) => ({
    id: row.id,
    title: row.title,
  }));

  // A page cannot be moved into its own subtree, so those are not offered —
  // the server action rejects them too, but a disabled option is a better
  // answer than an error message.
  const blocked = descendantIds(rows, id);
  const moveTargets = rows
    .filter((row) => !blocked.has(row.id))
    .map((row) => ({
      id: row.id,
      label: [...ancestorsOf(rows, row.id).map((a) => a.title), row.title].join(
        " › "
      ),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const children = childRows ?? [];
  const kind: NoteKind = page.kind === "meeting" ? "meeting" : "page";

  const subpages = (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">Subpages</h2>
      {children.length > 0 && (
        <ul className="space-y-1">
          {children.map((child) => {
            const Icon = child.kind === "meeting" ? CalendarClock : FileText;
            return (
              <li key={child.id}>
                <Link
                  href={`/notes/${child.id}`}
                  className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{child.title}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <NewPageButtons parentId={page.id} />
    </section>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        pageId={page.id}
        title={page.title}
        kind={kind}
        meetingDate={page.meeting_date}
        attendees={page.attendees}
        breadcrumb={breadcrumb}
        parentId={page.parent_id}
        moveTargets={moveTargets}
      />

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
