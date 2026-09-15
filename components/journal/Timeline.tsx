import Link from "next/link";
import { format } from "date-fns";
import { Bot, Lock, Target, Users } from "lucide-react";
import { Markdown } from "@/components/shared/Markdown";
import { JOURNAL_MOODS } from "@/lib/journal/constants";
import type { TimelineItem, TimelineSource } from "@/lib/journal/timeline";

const SOURCE_LABEL: Record<TimelineSource, string> = {
  journal: "Journal",
  look_back: "Coach look-back",
  check_in: "Goal check-in",
  daily: "Daily reflection",
  weekly: "Weekly reflection",
};

const PREVIEW_CHARS = 700;

export function Timeline({ items }: { items: TimelineItem[] }) {
  const months: { key: string; label: string; items: TimelineItem[] }[] = [];
  for (const item of items) {
    const key = item.date.slice(0, 7);
    let month = months.at(-1);
    if (!month || month.key !== key) {
      month = {
        key,
        label: format(new Date(`${key}-01T00:00:00`), "MMMM yyyy"),
        items: [],
      };
      months.push(month);
    }
    month.items.push(item);
  }

  return (
    <div className="space-y-6">
      {months.map((month) => (
        <section key={month.key} aria-label={month.label}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {month.label}
          </h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {month.items.map((item) => (
              <TimelineRow key={item.key} item={item} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TimelineRow({ item }: { item: TimelineItem }) {
  const day = new Date(`${item.date}T00:00:00`);
  const mood = JOURNAL_MOODS.find((m) => m.value === item.mood);
  const isLong = (item.body?.length ?? 0) > PREVIEW_CHARS;
  const linkLabel =
    item.source === "daily"
      ? "Open day"
      : item.source === "weekly"
        ? "Open week"
        : item.source === "check_in" && item.goalHref
          ? "Open goal"
          : isLong
          ? "Read all"
          : item.source === "journal"
            ? "Edit"
            : "Open";

  return (
    <li className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-3 p-4">
      <div className="pt-0.5 text-center leading-tight tabular-nums">
        <div className="text-lg font-semibold text-foreground">{format(day, "d")}</div>
        <div className="text-xs text-muted-foreground">{format(day, "EEE")}</div>
      </div>

      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {item.source === "look_back" && <Bot className="h-3.5 w-3.5 text-primary" />}
          <span className="font-semibold text-foreground">{SOURCE_LABEL[item.source]}</span>
          {mood && (
            <span role="img" aria-label={`Mood: ${mood.label}`} title={mood.label}>
              {mood.emoji}
            </span>
          )}
          {item.isPrivate !== null && (
            <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground">
              {item.isPrivate ? <Lock className="h-3 w-3" /> : <Users className="h-3 w-3" />}
              {item.isPrivate ? "Only me" : "Shared"}
            </span>
          )}
        </div>

        {item.source === "check_in" && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {item.goalTitle && item.goalHref && (
              <Link
                href={item.goalHref}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-border px-2 py-0.5 font-medium text-foreground hover:border-primary"
              >
                <Target className="h-3 w-3 shrink-0 text-primary" />
                <span className="truncate">{item.goalTitle}</span>
              </Link>
            )}
            {item.onTrack != null && (
              <span className="text-muted-foreground">Feels {item.onTrack}/10</span>
            )}
            {item.valueLabel && <span className="text-muted-foreground">{item.valueLabel}</span>}
          </div>
        )}

        {item.title && <p className="font-medium text-foreground">{item.title}</p>}

        {item.body && (
          <div className="text-sm leading-relaxed text-foreground">
            <Markdown
              content={isLong ? `${item.body.slice(0, PREVIEW_CHARS).trimEnd()}…` : item.body}
            />
          </div>
        )}

        {item.sections.length > 0 && (
          <dl className="space-y-1 text-sm leading-relaxed">
            {item.sections.map((s) => (
              <div key={s.label}>
                <dt className="inline text-muted-foreground">{s.label}: </dt>
                <dd className="inline whitespace-pre-wrap text-foreground">{s.text}</dd>
              </div>
            ))}
          </dl>
        )}

        <Link
          href={item.href}
          className="inline-block text-xs font-medium text-primary hover:underline"
        >
          {linkLabel}
        </Link>
      </div>
    </li>
  );
}
