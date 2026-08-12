import { createClient, getUser } from "@/lib/supabase/server";
import { NotesSidebar } from "./NotesSidebar";
import { buildTree } from "./tree";
import type { NoteKind } from "./types";

export default async function NotesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("note_pages")
    .select("id, parent_id, title, kind, position, updated_at")
    .eq("owner_id", user.id)
    .eq("is_archived", false)
    .order("position");

  const rows = (data ?? []).map((row) => ({
    ...row,
    kind: (row.kind === "meeting" ? "meeting" : "page") as NoteKind,
  }));

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <NotesSidebar tree={buildTree(rows)} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
