import Link from "next/link";
import { CalendarClock, FileText, ListChecks } from "lucide-react";
import { createClient, getUser } from "@/lib/supabase/server";
import { NewPageButtons } from "./NewPageButtons";

export default async function NotesIndexPage() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const [{ data: recent }, { data: openItems }] = await Promise.all([
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
  ]);

  const pages = recent ?? [];
  const items = openItems ?? [];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Notes</h1>
        <p className="text-sm text-muted-foreground">
          Meeting notes and project pages. Anything assigned to you becomes a
          tracked todo.
        </p>
      </div>

      <NewPageButtons />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            Recently edited
          </h2>
          {pages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing yet. Start a meeting note and type as you go.
            </p>
          ) : (
            <ul className="space-y-1">
              {pages.map((page) => {
                const Icon = page.kind === "meeting" ? CalendarClock : FileText;
                return (
                  <li key={page.id}>
                    <Link
                      href={`/notes/${page.id}`}
                      className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{page.title}</span>
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
                      {page?.title && (
                        <span className="shrink-0 text-xs opacity-70">
                          {page.title}
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
