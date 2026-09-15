import Link from "next/link";
import { format, subMonths } from "date-fns";
import { History } from "lucide-react";
import { createClient, getUser } from "@/lib/supabase/server";
import { todayIsoLocal } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { TIMELINE_FILTERS, toTimelineFilter } from "@/lib/journal/constants";
import { loadOnThisDay, loadTimeline } from "@/lib/journal/timeline";
import { JournalComposer } from "@/components/journal/JournalComposer";
import { JournalSearch } from "@/components/journal/JournalSearch";
import { NotesJournalTabs } from "@/components/journal/NotesJournalTabs";
import { Timeline } from "@/components/journal/Timeline";

const MONTH_STEP = 3;

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; months?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const todayIso = await todayIsoLocal();
  const filter = toTimelineFilter(params.type);
  const query = params.q?.trim() ?? "";
  const months = Math.min(
    120,
    Math.max(MONTH_STEP, Math.floor(Number(params.months)) || MONTH_STEP)
  );
  const since = subMonths(new Date(`${todayIso}T00:00:00`), months);
  const sinceIso = format(since, "yyyy-MM-dd");

  const [items, onThisDay] = await Promise.all([
    loadTimeline(supabase, user.id, { filter, query, sinceIso }),
    query ? Promise.resolve(null) : loadOnThisDay(supabase, user.id, todayIso),
  ]);

  const hrefWith = (next: { type?: string; months?: number }) => {
    const p = new URLSearchParams();
    if (query) p.set("q", query);
    const type = next.type ?? filter;
    if (type !== "all") p.set("type", type);
    if (next.months) p.set("months", String(next.months));
    const qs = p.toString();
    return qs ? `/journal?${qs}` : "/journal";
  };

  return (
    <div className="space-y-6">
      <NotesJournalTabs />

      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Journal</h1>
        <p className="text-sm text-muted-foreground">
          Write whenever something is on your mind. Your daily and weekly
          reflections show up here too, so everything reads back in one place.
        </p>
      </div>

      <section aria-label="New entry" className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <JournalComposer todayIso={todayIso} />
      </section>

      {onThisDay && (
        <Link
          href={onThisDay.href}
          className="block rounded-xl border border-border bg-muted/40 p-4 transition-colors hover:border-primary"
        >
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <History className="h-3.5 w-3.5" />
            {onThisDay.label} ·{" "}
            {format(new Date(`${onThisDay.date}T00:00:00`), "EEE d MMM yyyy")}
          </span>
          <span className="mt-1 block text-sm text-foreground">“{onThisDay.text}”</span>
        </Link>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Filter entries" className="flex flex-wrap gap-1.5">
          {TIMELINE_FILTERS.map((f) => (
            <Link
              key={f.value}
              href={hrefWith({ type: f.value })}
              aria-current={filter === f.value ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filter === f.value
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <div className="flex w-full sm:ml-auto sm:w-72">
          <JournalSearch key={query} initialQuery={query} filter={filter} />
        </div>
      </div>

      {query && (
        <p className="text-sm text-muted-foreground">
          {items.length} {items.length === 1 ? "match" : "matches"} for “{query}”.
        </p>
      )}

      {items.length > 0 ? (
        <Timeline items={items} />
      ) : (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {query
            ? "Nothing matched. Journal search matches whole words, so try a different one."
            : filter === "all"
              ? "Nothing here yet. Write your first entry above. Evening reflections from the Daily Log and weekly reflections from the Dashboard will show up here too."
              : `Nothing of this kind since ${format(since, "d MMM yyyy")}.`}
        </div>
      )}

      {!query && (
        <div className="flex flex-col items-center gap-2">
          <Link
            href={hrefWith({ months: months + MONTH_STEP })}
            scroll={false}
            className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Show older
          </Link>
          <p className="text-xs text-muted-foreground">
            Showing everything since {format(since, "d MMM yyyy")}
          </p>
        </div>
      )}
    </div>
  );
}
