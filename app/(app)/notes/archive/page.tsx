import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient, getUser } from "@/lib/supabase/server";
import { ArchiveList, type ArchivedBranch } from "./ArchiveList";
import { descendantIds } from "../tree";
import { toNoteKind } from "../types";

export default async function NotesArchivePage() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("note_pages")
    .select("id, parent_id, title, kind, meeting_date, archived_at")
    .eq("owner_id", user.id)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });

  const rows = (data ?? []).map((row) => ({
    ...row,
    kind: toNoteKind(row.kind),
  }));
  const archivedIds = new Set(rows.map((row) => row.id));

  // Only the top of each archived branch gets a card. A series and its year of
  // sittings went into the archive as one thing and comes back as one thing —
  // listing all 250 rows flat would be a worse wall than the sidebar it left.
  const branches: ArchivedBranch[] = rows
    .filter((row) => !row.parent_id || !archivedIds.has(row.parent_id))
    .map((row) => {
      const inside = [...descendantIds(rows, row.id)].filter(
        (id) => id !== row.id
      );
      const byId = new Map(rows.map((r) => [r.id, r]));
      return {
        id: row.id,
        title: row.title,
        kind: row.kind,
        meetingDate: row.meeting_date,
        archivedAt: row.archived_at!,
        contents: inside
          .map((id) => {
            const child = byId.get(id)!;
            return {
              id: child.id,
              title: child.title,
              kind: child.kind,
              meetingDate: child.meeting_date,
            };
          })
          .slice(0, 50),
        insideCount: inside.length,
      };
    });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link
          href="/notes"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to notes
        </Link>
        <h1 className="text-2xl font-bold text-foreground">Archive</h1>
        <p className="text-sm text-muted-foreground">
          Pages you have retired. Nothing here is lost — restore one and it goes
          back exactly where it was.
        </p>
      </div>

      <ArchiveList branches={branches} />
    </div>
  );
}
