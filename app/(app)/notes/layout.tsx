import { createClient, getUser } from "@/lib/supabase/server";
import { NotesSidebar } from "./NotesSidebar";
import { buildTree } from "./tree";
import { toNoteKind } from "./types";

export default async function NotesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const [{ data }, { count: archivedCount }] = await Promise.all([
    supabase
      .from("note_pages")
      .select("id, parent_id, title, kind, position, meeting_date, updated_at")
      .eq("owner_id", user.id)
      .eq("is_archived", false)
      .order("position"),
    supabase
      .from("note_pages")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .eq("is_archived", true),
  ]);

  const rows = (data ?? []).map((row) => ({
    ...row,
    kind: toNoteKind(row.kind),
  }));

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <NotesSidebar tree={buildTree(rows)} archivedCount={archivedCount ?? 0} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
