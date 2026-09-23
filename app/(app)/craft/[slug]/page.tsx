import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { createClient, getUser } from "@/lib/supabase/server";
import { Markdown } from "@/components/shared/Markdown";
import { ALL_TOPICS, topicBySlug, trackOf } from "@/lib/craft/curriculum";
import { TopicFooter } from "../TopicFooter";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return { title: topicBySlug(slug)?.title ?? "Foundations" };
}

export default async function TopicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const topic = topicBySlug(slug);
  if (!topic) notFound();

  const track = trackOf(slug);
  const index = ALL_TOPICS.findIndex((t) => t.slug === slug);
  const prev = index > 0 ? ALL_TOPICS[index - 1] : null;
  const next = index < ALL_TOPICS.length - 1 ? ALL_TOPICS[index + 1] : null;

  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const { data: row } = await supabase
    .from("craft_reading")
    .select("status, notes")
    .eq("owner_id", user.id)
    .eq("topic_slug", slug)
    .maybeSingle();

  return (
    <article className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <Link
        href="/craft"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Foundations
        {track && <span className="text-muted-foreground/60">&middot; {track.title}</span>}
      </Link>

      <header className="mb-8 mt-4">
        <h1 className="text-2xl font-semibold leading-tight tracking-tight text-foreground">
          {topic.title}
        </h1>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">{topic.hook}</p>
        <p className="mt-2 text-xs tabular-nums text-muted-foreground/80">
          {topic.minutes} min read
        </p>
      </header>

      <Section title="The idea">
        <div className="prose-sm space-y-3 text-[15px] leading-relaxed text-foreground">
          <Markdown content={topic.idea} />
        </div>
      </Section>

      <Section title="Where it bites">
        <div className="space-y-3 text-[15px] leading-relaxed text-foreground">
          <Markdown content={topic.bites} />
        </div>
      </Section>

      <Section title="What you will actually decide">
        <ul className="space-y-2.5">
          {topic.decisions.map((d, i) => (
            <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-foreground">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span>{d}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Go and look at your own code">
        <ol className="space-y-2.5">
          {topic.inYourCode.map((item, i) => (
            <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-foreground">
              <span className="w-4 shrink-0 text-sm tabular-nums text-muted-foreground">
                {i + 1}.
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="You have got it when">
        <ul className="space-y-2.5">
          {topic.gotIt.map((item, i) => (
            <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-foreground">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Go deeper">
        <ul className="space-y-2">
          {topic.deeper.map((item, i) => (
            <li key={i} className="text-sm leading-relaxed">
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-start gap-1.5 text-primary hover:underline"
                >
                  {item.label}
                  <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
                </a>
              ) : (
                <span className="text-muted-foreground">{item.label}</span>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <TopicFooter
        slug={topic.slug}
        initialStatus={row?.status === "read" ? "read" : row ? "reading" : "unread"}
        initialNotes={row?.notes ?? ""}
      />

      <nav className="mt-8 flex items-stretch justify-between gap-3 border-t border-border pt-4">
        {prev ? (
          <Link
            href={`/craft/${prev.slug}`}
            className="group flex max-w-[48%] flex-col gap-0.5 text-left"
          >
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <ArrowLeft className="h-3 w-3" />
              Previous
            </span>
            <span className="truncate text-sm text-foreground group-hover:underline">
              {prev.title}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link
            href={`/craft/${next.slug}`}
            className="group flex max-w-[48%] flex-col gap-0.5 text-right"
          >
            <span className="inline-flex items-center justify-end gap-1 text-xs text-muted-foreground">
              Next
              <ArrowRight className="h-3 w-3" />
            </span>
            <span className="truncate text-sm text-foreground group-hover:underline">
              {next.title}
            </span>
          </Link>
        )}
      </nav>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}
