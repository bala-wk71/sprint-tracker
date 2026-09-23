import Link from "next/link";
import { ArrowRight, BookOpen, Check, ShieldCheck } from "lucide-react";
import { createClient, getUser } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import {
  TOPIC_COUNT,
  TRACKS,
  minutesRemaining,
  nextTopic,
  readCount,
  trackProgress,
  type ReadingMap,
} from "@/lib/craft/curriculum";

export const metadata = { title: "Foundations" };

export default async function CraftPage() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const [{ data: readingRows }, { count: runsDone }] = await Promise.all([
    supabase
      .from("craft_reading")
      .select("topic_slug, status, notes, read_at")
      .eq("owner_id", user.id),
    supabase
      .from("craft_runs")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .not("completed_at", "is", null),
  ]);

  const reading: ReadingMap = Object.fromEntries(
    (readingRows ?? []).map((row) => [
      row.topic_slug,
      {
        topic_slug: row.topic_slug,
        status: row.status === "read" ? ("read" as const) : ("reading" as const),
        notes: row.notes,
        read_at: row.read_at,
      },
    ])
  );

  const done = readCount(reading);
  const next = nextTopic(reading);
  const minutesLeft = minutesRemaining(reading);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Foundations
        </h1>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground">
          The things worth reading once, so that you recognise them for the rest of your
          career. Not a to-do list &mdash; every topic ends by pointing at code you already
          own, because that is what turns reading into judgment.
        </p>
      </header>

      {/* Two numbers, because they are the two halves of the same habit. */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold tabular-nums text-foreground">
              {done}
            </span>
            <span className="text-sm text-muted-foreground">of {TOPIC_COUNT} read</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary"
              style={{ width: `${(done / TOPIC_COUNT) * 100}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {minutesLeft > 0 ? `About ${minutesLeft} min left in total.` : "All of it."}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold tabular-nums text-foreground">
              {runsDone ?? 0}
            </span>
            <span className="text-sm text-muted-foreground">done right</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Tasks closed with the whole checklist ticked. Attach one from the shield on any
            todo.
          </p>
          <Link
            href="/todo"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Go to Todo
          </Link>
        </div>
      </div>

      {next && (
        <Link
          href={`/craft/${next.slug}`}
          className="mb-8 block rounded-xl border border-primary/40 bg-primary/5 p-4 transition-colors hover:border-primary/70 sm:p-5"
        >
          <span className="text-xs font-medium uppercase tracking-wide text-primary">
            {reading[next.slug]?.status === "reading" ? "Carry on" : "Next up"}
          </span>
          <h2 className="mt-1.5 text-lg font-semibold text-foreground">{next.title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{next.hook}</p>
          <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
            Read it &middot; {next.minutes} min
            <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      )}

      <div className="space-y-8">
        {TRACKS.map((track) => {
          const progress = trackProgress(track, reading);
          return (
            <section key={track.slug}>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <h2 className="text-base font-semibold text-foreground">{track.title}</h2>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {progress.done}/{progress.total}
                </span>
              </div>
              <p className="mb-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
                {track.blurb}
              </p>

              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {track.topics.map((topic) => {
                  const status = reading[topic.slug]?.status;
                  return (
                    <li key={topic.slug}>
                      <Link
                        href={`/craft/${topic.slug}`}
                        className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/50"
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                            status === "read"
                              ? "border-primary bg-primary text-primary-foreground"
                              : status === "reading"
                                ? "border-primary text-primary"
                                : "border-muted-foreground/40 text-muted-foreground"
                          )}
                        >
                          {status === "read" ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <BookOpen className="h-2.5 w-2.5" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block text-sm font-medium",
                              status === "read" ? "text-muted-foreground" : "text-foreground"
                            )}
                          >
                            {topic.title}
                          </span>
                          <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                            {topic.hook}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {topic.minutes} min
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
