import type { SupabaseClient } from "@supabase/supabase-js";
import { format, subMonths, subYears } from "date-fns";
import type { Database } from "@/lib/supabase/types";
import { weekEndIsoOf } from "@/lib/week";
import { formatValue } from "@/lib/goals/progress";
import type { TimelineFilter } from "./constants";

type Client = SupabaseClient<Database>;

export type TimelineSource = "journal" | "look_back" | "check_in" | "daily" | "weekly";

/**
 * One row of the journal timeline. Journal entries carry a markdown body;
 * reflections from the Daily Log and the Dashboard carry labelled sections,
 * because they were written as answers to fixed questions.
 */
export type TimelineItem = {
  key: string;
  date: string;
  source: TimelineSource;
  title: string | null;
  body: string | null;
  sections: { label: string; text: string }[];
  mood: string | null;
  /** null for reflections, whose privacy is per field rather than per row. */
  isPrivate: boolean | null;
  href: string;
  createdAt: string;
  /** Goal check-ins only: the goal it belongs to and what was recorded. */
  goalTitle?: string;
  goalHref?: string;
  onTrack?: number | null;
  valueLabel?: string | null;
};

const LIMIT = 200;

/** PostgREST `or()` filters break on these, so search terms drop them. */
function safeTerm(query: string) {
  return query.replace(/[,()%*\\:."']/g, " ").trim();
}

function sections(pairs: [string, string | null][]) {
  return pairs
    .filter(([, text]) => text && text.trim())
    .map(([label, text]) => ({ label, text: (text as string).trim() }));
}

export async function loadTimeline(
  supabase: Client,
  ownerId: string,
  opts: { filter: TimelineFilter; query: string; sinceIso: string }
): Promise<TimelineItem[]> {
  const term = safeTerm(opts.query);
  const searching = term.length > 0;
  const want = (f: TimelineFilter) => opts.filter === "all" || opts.filter === f;

  const journal = async (): Promise<TimelineItem[]> => {
    let q = supabase
      .from("journal_entries")
      .select(
        "id, entry_date, title, body, mood, kind, is_private, created_at, goal_id, on_track, value, goals(title, unit)"
      )
      .eq("owner_id", ownerId);
    // "Journal" means what you wrote and the coach's letters; check-ins get
    // their own filter so a busy goal doesn't bury everything else.
    if (opts.filter === "journal") q = q.in("kind", ["entry", "look_back"]);
    if (opts.filter === "check_in") q = q.eq("kind", "check_in");
    q = searching
      ? q.textSearch("search_vector", term, { type: "websearch" })
      : q.gte("entry_date", opts.sinceIso);
    const { data } = await q
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    return (data ?? []).map((e): TimelineItem => {
      const base = {
        key: `j:${e.id}`,
        date: e.entry_date,
        title: e.title || null,
        body: e.body,
        sections: [],
        mood: e.mood,
        isPrivate: e.is_private,
        href: `/journal/${e.id}`,
        createdAt: e.created_at,
      };
      if (e.kind !== "check_in") {
        return { ...base, source: e.kind === "look_back" ? "look_back" : "journal" };
      }
      // A check-in whose goal was deleted keeps its text but loses the link.
      const goalHref = e.goal_id ? `/goals/${e.goal_id}` : undefined;
      return {
        ...base,
        source: "check_in",
        href: goalHref ?? base.href,
        goalTitle: e.goals?.title,
        goalHref,
        onTrack: e.on_track,
        valueLabel: e.value === null ? null : formatValue(e.value, e.goals?.unit ?? null),
      };
    });
  };

  const daily = async (): Promise<TimelineItem[]> => {
    const like = `%${term}%`;
    let q = supabase
      .from("daily_logs")
      .select("id, log_date, reflection, win, improvement, gratitude, updated_at")
      .eq("owner_id", ownerId);
    q = searching
      ? q.or(
          `reflection.ilike.${like},win.ilike.${like},improvement.ilike.${like},gratitude.ilike.${like}`
        )
      : q
          .gte("log_date", opts.sinceIso)
          .or(
            "reflection.not.is.null,win.not.is.null,improvement.not.is.null,gratitude.not.is.null"
          );
    const { data } = await q.order("log_date", { ascending: false }).limit(LIMIT);
    return (data ?? []).flatMap((log) => {
      const parts = sections([
        ["Reflection", log.reflection],
        ["Win", log.win],
        ["To improve", log.improvement],
        ["Grateful for", log.gratitude],
      ]);
      if (parts.length === 0) return [];
      return [
        {
          key: `d:${log.id}`,
          date: log.log_date,
          source: "daily" as const,
          title: null,
          body: null,
          sections: parts,
          mood: null,
          isPrivate: null,
          href: `/daily?date=${log.log_date}`,
          createdAt: log.updated_at,
        },
      ];
    });
  };

  const weekly = async (): Promise<TimelineItem[]> => {
    const like = `%${term}%`;
    let q = supabase
      .from("sprints")
      .select(
        "id, week_start_date, reflection_went_well, reflection_improve, reflection_lesson, updated_at"
      )
      .eq("owner_id", ownerId);
    q = searching
      ? q.or(
          `reflection_went_well.ilike.${like},reflection_improve.ilike.${like},reflection_lesson.ilike.${like}`
        )
      : q
          .gte("week_start_date", opts.sinceIso)
          .or(
            "reflection_went_well.not.is.null,reflection_improve.not.is.null,reflection_lesson.not.is.null"
          );
    const { data } = await q.order("week_start_date", { ascending: false }).limit(LIMIT);
    return (data ?? []).flatMap((sprint) => {
      const parts = sections([
        ["Went well", sprint.reflection_went_well],
        ["To improve", sprint.reflection_improve],
        ["Lesson", sprint.reflection_lesson],
      ]);
      if (parts.length === 0) return [];
      return [
        {
          key: `w:${sprint.id}`,
          // A week's reflection belongs at the end of the week it describes.
          date: weekEndIsoOf(sprint.week_start_date),
          source: "weekly" as const,
          title: null,
          body: null,
          sections: parts,
          mood: null,
          isPrivate: null,
          href: `/dashboard?week=${sprint.week_start_date}`,
          createdAt: sprint.updated_at,
        },
      ];
    });
  };

  const batches = await Promise.all([
    want("journal") || want("check_in") ? journal() : [],
    want("daily") ? daily() : [],
    want("weekly") ? weekly() : [],
  ]);

  return batches
    .flat()
    .sort((a, b) =>
      a.date === b.date
        ? b.createdAt.localeCompare(a.createdAt)
        : b.date.localeCompare(a.date)
    );
}

export type OnThisDay = { label: string; date: string; text: string; href: string };

/**
 * Something you wrote a year, six months or a month ago today — the most
 * distant one wins, because that is the one you have most likely forgotten.
 */
export async function loadOnThisDay(
  supabase: Client,
  ownerId: string,
  todayIso: string
): Promise<OnThisDay | null> {
  const today = new Date(`${todayIso}T00:00:00`);
  const candidates = [
    { label: "One year ago", date: format(subYears(today, 1), "yyyy-MM-dd") },
    { label: "Six months ago", date: format(subMonths(today, 6), "yyyy-MM-dd") },
    { label: "One month ago", date: format(subMonths(today, 1), "yyyy-MM-dd") },
  ];
  const dates = candidates.map((c) => c.date);

  const [{ data: entries }, { data: logs }] = await Promise.all([
    supabase
      .from("journal_entries")
      .select("id, entry_date, title, body")
      .eq("owner_id", ownerId)
      .eq("kind", "entry")
      .in("entry_date", dates)
      .order("created_at", { ascending: true }),
    supabase
      .from("daily_logs")
      .select("log_date, reflection, win")
      .eq("owner_id", ownerId)
      .in("log_date", dates),
  ]);

  for (const c of candidates) {
    const entry = entries?.find((e) => e.entry_date === c.date);
    if (entry) {
      return { ...c, text: excerpt(entry.title || entry.body), href: `/journal/${entry.id}` };
    }
    const log = logs?.find((l) => l.log_date === c.date);
    const text = log?.reflection?.trim() || log?.win?.trim();
    if (text) return { ...c, text: excerpt(text), href: `/daily?date=${c.date}` };
  }
  return null;
}

function excerpt(text: string, max = 240) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
}
