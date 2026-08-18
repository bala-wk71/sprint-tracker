import Link from "next/link";
import { Archive, ListChecks } from "lucide-react";
import { createClient, getUser } from "@/lib/supabase/server";
import { NewPageButtons } from "./NewPageButtons";
import { NotesSearch } from "./NotesSearch";
import { KindIcon } from "./kinds";
import { ancestorsOf } from "./tree";
import { toNoteKind } from "./types";

export default async function NotesIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  // Hits the GIN index on search_vector, so this stays one query as the
  // workspace grows rather than a LIKE scan over every body.
  const { data: matches } = query
    ? await supabase
        .from("note_pages")
        .select("id, title, kind, updated_at")
        .eq("owner_id", user.id)
        .eq("is_archived", false)
        .textSearch("search_vector", query, { type: "websearch" })
        .limit(30)
    : { data: null };

  const [{ data: recent }, { data: openItems }, { data: tree }, { count: archivedCount }] =
    await Promise.all([
    supabase
      .from("note_pages")
      .select("id, title, kind, updated_at")
      .eq("owner_id", user.id)
      .eq("is_archived", false)
      .order("updated_at", { ascending: false })
      .limit(8),
    supabase
      .from("todo_tasks")
      .select("id, title, due_date, source_page_id, note_pages(title)")
      .eq("owner_id", user.id)
      .eq("is_completed", false)
      .not("source_page_id", "is", null)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(8),
    // An occurrence is titled by its date alone, so "Aug 18" on its own says
    // nothing. The tree is what turns it back into "Daily Scrum › Aug 18".
    supabase
      .from("note_pages")
      .select("id, parent_id, title, kind")
      .eq("owner_id", user.id)
      .eq("is_archived", false),
    supabase
      .from("note_pages")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .eq("is_archived", true),
  ]);

  const pages = recent ?? [];
  const items = openItems ?? [];
  const treeRows = (tree ?? []).map((row) => ({
    ...row,
    kind: toNoteKind(row.kind),
  }));

  /** "Daily Scrum" for an occurrence — the series it sits in, if any. */
  const seriesOf = (pageId: string): string | null => {
    const chain = ancestorsOf(treeRows, pageId);
    for (let i = chain.length - 1; i >= 0; i--) {
      if (chain[i].kind === "series") return chain[i].title;
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">Notes</h1>
          <p className="text-sm text-muted-foreground">
            Meetings, recurring series and project pages. Anything assigned to
            you becomes a tracked todo.
          </p>
        </div>
        <Link
          href="/notes/archive"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <Archive className="h-4 w-4" />
          Archive
          {archivedCount ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">
              {archivedCount}
            </span>
          ) : null}
        </Link>
      </div>

      <NewPageButtons />

      <NotesSearch initialQuery={query} />

      {matches !== null && (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            {`${matches.length} result${matches.length === 1 ? "" : "s"} for “${query}”`}
          </h2>
          {matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing matched. Full-text search matches whole words.
            </p>
          ) : (
            <ul className="space-y-1">
              {matches.map((page) => {
                const series = seriesOf(page.id);
                return (
                  <li key={page.id}>
                    <Link
                      href={`/notes/${page.id}`}
                      className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <KindIcon
                        kind={toNoteKind(page.kind)}
                        className="h-4 w-4 shrink-0"
                      />
                      {series && (
                        <span className="min-w-0 max-w-[45%] shrink truncate opacity-70">
                          {series} ›
                        </span>
                      )}
                      <span className="min-w-0 truncate">{page.title}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            Recently edited
          </h2>
          {pages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing yet. Start a meeting note and type as you go — if it
              repeats, make it a series instead.
            </p>
          ) : (
            <ul className="space-y-1">
              {pages.map((page) => {
                const series = seriesOf(page.id);
                return (
                  <li key={page.id}>
                    <Link
                      href={`/notes/${page.id}`}
                      className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <KindIcon
                        kind={toNoteKind(page.kind)}
                        className="h-4 w-4 shrink-0"
                      />
                      {series && (
                        <span className="min-w-0 max-w-[45%] shrink truncate opacity-70">
                          {series} ›
                        </span>
                      )}
                      <span className="min-w-0 truncate">{page.title}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <ListChecks className="h-4 w-4" />
            Open action items
          </h2>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No open items from your notes.
            </p>
          ) : (
            <ul className="space-y-1">
              {items.map((item) => {
                const page = Array.isArray(item.note_pages)
                  ? item.note_pages[0]
                  : item.note_pages;
                const series = item.source_page_id
                  ? seriesOf(item.source_page_id)
                  : null;
                // "Aug 18" alone does not say which meeting owed this.
                const from = [series, page?.title].filter(Boolean).join(" › ");
                return (
                  <li key={item.id}>
                    <Link
                      href={`/notes/${item.source_page_id}`}
                      className="flex items-start gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {item.title}
                      </span>
                      {item.due_date && (
                        <span className="shrink-0 text-xs tabular-nums">
                          {item.due_date}
                        </span>
                      )}
                      {from && (
                        // The page a task came from is context, not the point:
                        // let a long note title give way rather than push the
                        // row past the screen.
                        <span className="min-w-0 max-w-[45%] shrink truncate text-xs opacity-70">
                          {from}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
