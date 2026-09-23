import Link from "next/link";
import { ArrowRight, GraduationCap } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  TOPIC_COUNT,
  nextTopic,
  readCount,
  type ReadingMap,
} from "@/lib/craft/curriculum";

/**
 * One topic, surfaced where you already look every morning.
 *
 * A twenty-three topic curriculum you have to remember to visit is a
 * bookmark, not a habit, so the dashboard carries the next one. It disappears
 * once everything is read rather than congratulating you forever.
 */
export async function FoundationsCard({ ownerId }: { ownerId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("craft_reading")
    .select("topic_slug, status, notes, read_at")
    .eq("owner_id", ownerId);

  const reading: ReadingMap = Object.fromEntries(
    (data ?? []).map((row) => [
      row.topic_slug,
      {
        topic_slug: row.topic_slug,
        status: row.status === "read" ? ("read" as const) : ("reading" as const),
        notes: row.notes,
        read_at: row.read_at,
      },
    ])
  );

  const topic = nextTopic(reading);
  if (!topic) return null;

  const done = readCount(reading);
  const inProgress = reading[topic.slug]?.status === "reading";

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <GraduationCap className="h-4 w-4 text-primary" />
          Foundations
        </h2>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {done} of {TOPIC_COUNT}
        </span>
      </div>

      <Link href={`/craft/${topic.slug}`} className="group block">
        <p className="text-xs font-medium uppercase tracking-wide text-primary">
          {inProgress ? "Carry on" : "Next up"}
        </p>
        <p className="mt-1 text-base font-medium text-foreground group-hover:underline">
          {topic.title}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{topic.hook}</p>
        <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
          {topic.minutes} min
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </Link>
    </section>
  );
}
