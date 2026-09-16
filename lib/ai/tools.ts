import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { gatherHealthContext } from "./healthContext";
import { gatherWeeklyContext } from "./context";
import {
  computeShieldedStreak,
  levelFromXp,
  untrackedRun,
  XP_DECAY_GRACE_DAYS,
  type GamificationStats,
} from "@/lib/gamification";
import { addDaysIso, weekStartIsoOf, type WeekStartDay } from "@/lib/week";

type Client = SupabaseClient<Database>;

/**
 * What the coach can go and look up mid-answer.
 *
 * The assistant used to receive one fixed snapshot — current sprint, last
 * sprint, today's log, 14 days of history, health, goals — rebuilt into the
 * system prompt on every single turn. That is expensive for "what should I do
 * today?" and useless for "how did June compare to July", because the data
 * simply wasn't in the window. Letting the model fetch what it needs makes the
 * whole app reachable and most turns cheaper.
 *
 * Every tool is scoped to the calling user through the request's Supabase
 * client, so RLS applies exactly as it does everywhere else. Results are
 * capped in size: a tool that returns a year of rows just relocates the
 * context problem.
 */

export type ToolContext = {
  supabase: Client;
  userId: string;
  todayIso: string;
  weekStartDay: WeekStartDay;
  /** users.coach_reads_journal — gates the journal tool entirely. */
  readsJournal: boolean;
};

export type ToolDeclaration = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

/** What ran, for the "read:" chips under an answer. */
export type ToolTrace = { name: string; summary: string };

const MAX_RANGE_DAYS = 120;
const MAX_ROWS = 60;

const DATE = {
  type: "string",
  description: "Date as YYYY-MM-DD.",
};

export function toolDeclarations(ctx: ToolContext): ToolDeclaration[] {
  const tools: ToolDeclaration[] = [
    {
      name: "get_days",
      description:
        "Daily logs for a date range: mood, energy, intention, productivity rating, priorities and hours logged per task. Use for questions about how specific days or stretches of days went.",
      parameters: {
        type: "object",
        properties: { from: DATE, to: DATE },
        required: ["from", "to"],
      },
    },
    {
      name: "get_week",
      description:
        "One sprint week: planned tasks with target vs logged hours, plus that week's daily logs. Use for weekly reviews and 'how did last week go'.",
      parameters: {
        type: "object",
        properties: {
          week_start: {
            ...DATE,
            description:
              "Any date in the week of interest; it is snapped to the user's own week start.",
          },
        },
        required: ["week_start"],
      },
    },
    {
      name: "get_health",
      description:
        "Training, body weight, nutrition and hydration around a date: recent workouts, lift history, weight trend, calories and protein. Use for any health, gym, diet or weight question.",
      parameters: {
        type: "object",
        properties: {
          date: {
            ...DATE,
            description: "Anchor date; defaults to today.",
          },
        },
      },
    },
    {
      name: "get_goals",
      description:
        "The user's long-term goals: status, target date, numeric or step progress, and when each was last checked in on.",
      parameters: { type: "object", properties: {} },
    },
    {
      name: "get_todos",
      description:
        "The user's todo list. Use when asked what is outstanding, or what they have been getting done.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["open", "done", "all"],
            description: "Which tasks to return. Defaults to open.",
          },
        },
      },
    },
    {
      name: "get_progress",
      description:
        "XP, level, daily streak and how many days have gone untracked, including whether XP is currently decaying. Use for questions about level, streak, XP or consistency.",
      parameters: { type: "object", properties: {} },
    },
  ];

  // Journal text is opt-in. People write honestly because they know who is
  // reading, so the tool is not merely refused when the flag is off — it is
  // never declared, and the model cannot ask for what it cannot see.
  if (ctx.readsJournal) {
    tools.push({
      name: "search_journal",
      description:
        "Search the user's own journal entries by text and/or date range. Only entries they have not hidden from you are returned.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Words to look for. Omit to list entries by date.",
          },
          from: DATE,
          to: DATE,
        },
      },
    });
  }

  return tools;
}

// ----------------------------------------------------------------------

function clampRange(
  from: unknown,
  to: unknown,
  todayIso: string
): { from: string; to: string } {
  const isDate = (v: unknown): v is string =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

  let end = isDate(to) ? to : todayIso;
  let start = isDate(from) ? from : addDaysIso(end, -13);
  if (start > end) [start, end] = [end, start];
  // A model that asks for "2020-01-01 to today" would otherwise pull every row
  // the user has; keep the window to something that fits in a prompt.
  if (start < addDaysIso(end, -MAX_RANGE_DAYS)) {
    start = addDaysIso(end, -MAX_RANGE_DAYS);
  }
  return { from: start, to: end };
}

async function getDays(ctx: ToolContext, args: Record<string, unknown>) {
  const { from, to } = clampRange(args.from, args.to, ctx.todayIso);

  const { data: logs } = await ctx.supabase
    .from("daily_logs")
    .select(
      "id, log_date, morning_mood, morning_energy, daily_intention, closing_mood, productivity_rating, reflection, reflection_private, improvement, win"
    )
    .eq("owner_id", ctx.userId)
    .gte("log_date", from)
    .lte("log_date", to)
    .order("log_date")
    .limit(MAX_ROWS);

  const rows = logs ?? [];
  if (rows.length === 0) {
    return {
      text: `No daily logs between ${from} and ${to}.`,
      summary: `${from} → ${to} daily logs (none)`,
    };
  }

  const ids = rows.map((r) => r.id);
  const [{ data: priorities }, { data: entries }] = await Promise.all([
    ctx.supabase
      .from("priorities")
      .select("daily_log_id, description, status")
      .in("daily_log_id", ids),
    ctx.supabase
      .from("time_entries")
      .select("daily_log_id, duration_hours, tasks(name, category)")
      .in("daily_log_id", ids)
      .eq("is_private", false),
  ]);

  const lines: string[] = [];
  for (const log of rows) {
    const parts = [`### ${log.log_date}`];
    if (log.morning_mood) parts.push(`morning mood ${log.morning_mood}`);
    if (log.morning_energy !== null)
      parts.push(`energy ${log.morning_energy}/5`);
    if (log.closing_mood) parts.push(`evening mood ${log.closing_mood}`);
    if (log.productivity_rating !== null)
      parts.push(`productivity ${log.productivity_rating}/5`);
    lines.push(parts.join(", "));

    if (log.daily_intention) lines.push(`intention: ${log.daily_intention}`);
    if (log.win) lines.push(`win: ${log.win}`);
    if (log.improvement) lines.push(`to improve: ${log.improvement}`);
    // Privacy flags are honoured here exactly as the snapshot builder does.
    if (log.reflection && !log.reflection_private)
      lines.push(`reflection: ${log.reflection}`);

    const dayPriorities = (priorities ?? []).filter(
      (p) => p.daily_log_id === log.id
    );
    for (const p of dayPriorities) {
      lines.push(`- priority: ${p.description} [${p.status}]`);
    }

    const dayEntries = (entries ?? []).filter((e) => e.daily_log_id === log.id);
    const hours = dayEntries.reduce((s, e) => s + Number(e.duration_hours), 0);
    if (dayEntries.length > 0) {
      lines.push(`time logged: ${hours.toFixed(1)}h`);
      for (const e of dayEntries) {
        const task = Array.isArray(e.tasks) ? e.tasks[0] : e.tasks;
        lines.push(
          `- ${task?.name ?? "Unlinked"} (${task?.category ?? "uncategorised"}): ${Number(e.duration_hours)}h`
        );
      }
    }
  }

  return {
    text: lines.join("\n"),
    summary: `${from} → ${to} daily logs (${rows.length})`,
  };
}

async function getWeek(ctx: ToolContext, args: Record<string, unknown>) {
  const anchor =
    typeof args.week_start === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(args.week_start)
      ? args.week_start
      : ctx.todayIso;
  const weekStart = weekStartIsoOf(anchor, ctx.weekStartDay);

  const { context } = await gatherWeeklyContext(
    ctx.supabase,
    ctx.userId,
    weekStart
  );

  return {
    text: context || `Nothing recorded for the week of ${weekStart}.`,
    summary: `week of ${weekStart}`,
  };
}

async function getHealth(ctx: ToolContext, args: Record<string, unknown>) {
  const date =
    typeof args.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.date)
      ? args.date
      : ctx.todayIso;

  const text = await gatherHealthContext(ctx.supabase, ctx.userId, date);
  return { text, summary: `health around ${date}` };
}

async function getGoals(ctx: ToolContext) {
  const { data } = await ctx.supabase
    .from("goals")
    .select(
      "id, title, area, status, start_date, target_date, track_type, start_value, target_value, current_value, unit, last_checkin_on, goal_steps(done_at)"
    )
    .eq("owner_id", ctx.userId)
    .order("target_date", { ascending: true })
    .limit(30);

  const goals = data ?? [];
  if (goals.length === 0) {
    return { text: "No goals set.", summary: "goals (none)" };
  }

  const lines = goals.map((g) => {
    const parts = [
      `- ${g.title} [${g.status}, ${g.area}] ${g.start_date} → ${g.target_date}`,
    ];
    if (g.track_type === "steps") {
      const done = g.goal_steps.filter((s) => s.done_at).length;
      parts.push(`steps ${done}/${g.goal_steps.length}`);
    } else if (g.track_type === "number") {
      const unit = g.unit ? ` ${g.unit}` : "";
      parts.push(
        `from ${g.start_value}${unit} to ${g.target_value}${unit}, now ${g.current_value ?? g.start_value}${unit}`
      );
    }
    parts.push(
      g.last_checkin_on ? `last check-in ${g.last_checkin_on}` : "no check-ins yet"
    );
    return parts.join("; ");
  });

  return { text: lines.join("\n"), summary: `goals (${goals.length})` };
}

async function getTodos(ctx: ToolContext, args: Record<string, unknown>) {
  const status =
    args.status === "done" || args.status === "all" ? args.status : "open";

  let query = ctx.supabase
    .from("todo_tasks")
    .select("title, description, is_completed, completed_at, todo_sections(name)")
    .eq("owner_id", ctx.userId);

  if (status === "open") query = query.eq("is_completed", false);
  if (status === "done") query = query.eq("is_completed", true);

  const { data } = await query
    .order("is_completed")
    .order("position")
    .limit(MAX_ROWS);

  const rows = data ?? [];
  if (rows.length === 0) {
    return { text: `No ${status} todos.`, summary: `todos (${status}, none)` };
  }

  const lines = rows.map((t) => {
    const section = Array.isArray(t.todo_sections)
      ? t.todo_sections[0]
      : t.todo_sections;
    const where = section?.name ? ` (${section.name})` : "";
    const mark = t.is_completed ? "x" : " ";
    const when =
      t.is_completed && t.completed_at
        ? ` — done ${t.completed_at.slice(0, 10)}`
        : "";
    return `- [${mark}] ${t.title}${where}${when}`;
  });

  return {
    text: lines.join("\n"),
    summary: `todos (${status}, ${rows.length})`,
  };
}

async function getProgress(ctx: ToolContext) {
  const [{ data: statsRaw }, { data: totalXpRaw }] = await Promise.all([
    ctx.supabase.rpc("gamification_stats"),
    ctx.supabase.rpc("total_xp"),
  ]);

  if (!statsRaw) return { text: "No progress data.", summary: "progress" };

  const stats = statsRaw as unknown as GamificationStats;
  const level = levelFromXp(Number(totalXpRaw ?? 0));
  const streak = computeShieldedStreak(stats.log_dates, ctx.todayIso);
  const tracked = stats.tracked_dates ?? [];
  const untracked = untrackedRun(tracked, ctx.todayIso);

  const lines = [
    `Level ${level.level} (${level.title}) — ${level.totalXp} XP, ${level.progress}/${level.span} into this level.`,
    `Daily streak: ${streak.current} days, ${streak.shields} shields banked.`,
    `Days logged in total: ${stats.log_dates.length}. Hours tracked: ${Number(stats.total_hours).toFixed(1)}.`,
    untracked === 0
      ? "Today is tracked, so no XP is decaying."
      : untracked > XP_DECAY_GRACE_DAYS
        ? `${untracked} days untracked — XP is decaying at 2% a day.`
        : `${untracked} untracked ${untracked === 1 ? "day" : "days"}; decay starts after ${XP_DECAY_GRACE_DAYS}.`,
    "XP rules: tracking the day earns (check-in, wrap-up, time, health, journal). Todos, goal steps and sprint creation earn only on a day that was tracked, and are capped per day.",
  ];

  return { text: lines.join("\n"), summary: "XP, level and streak" };
}

async function searchJournal(ctx: ToolContext, args: Record<string, unknown>) {
  // Belt and braces: the tool is not declared when the flag is off, but a
  // model can hallucinate a call, and this must never leak.
  if (!ctx.readsJournal) {
    return {
      text: "The user has not given you access to their journal.",
      summary: "journal (not permitted)",
    };
  }

  let query = ctx.supabase
    .from("journal_entries")
    .select("entry_date, title, body, mood, kind")
    .eq("owner_id", ctx.userId)
    .eq("author", "owner")
    .eq("hide_from_coach", false);

  if (typeof args.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.from)) {
    query = query.gte("entry_date", args.from);
  }
  if (typeof args.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.to)) {
    query = query.lte("entry_date", args.to);
  }

  const words = typeof args.query === "string" ? args.query.trim() : "";
  if (words) {
    // websearch_to_tsquery tolerates whatever phrasing the model passes;
    // plainto_ would choke on quotes and operators.
    query = query.textSearch("search_vector", words, {
      type: "websearch",
      config: "english",
    });
  }

  const { data } = await query
    .order("entry_date", { ascending: false })
    .limit(20);

  const rows = data ?? [];
  if (rows.length === 0) {
    return {
      text: words ? `No journal entries matching "${words}".` : "No journal entries.",
      summary: words ? `journal search "${words}" (none)` : "journal (none)",
    };
  }

  const lines = rows.map((e) => {
    const head = `### ${e.entry_date}${e.title ? ` — ${e.title}` : ""}${e.mood ? ` (${e.mood})` : ""}`;
    // Entries run to 20k characters; a handful of those would swamp the turn.
    const body = e.body.length > 1200 ? `${e.body.slice(0, 1200)}…` : e.body;
    return `${head}\n${body}`;
  });

  return {
    text: lines.join("\n\n"),
    summary: words
      ? `journal search "${words}" (${rows.length})`
      : `journal entries (${rows.length})`,
  };
}

// ----------------------------------------------------------------------

/**
 * Run one tool call. Never throws: a failed lookup is reported back to the
 * model as text so it can say what it could not see, rather than collapsing
 * the whole answer.
 */
export async function runTool(
  ctx: ToolContext,
  name: string,
  args: Record<string, unknown>
): Promise<{ text: string; summary: string }> {
  try {
    switch (name) {
      case "get_days":
        return await getDays(ctx, args);
      case "get_week":
        return await getWeek(ctx, args);
      case "get_health":
        return await getHealth(ctx, args);
      case "get_goals":
        return await getGoals(ctx);
      case "get_todos":
        return await getTodos(ctx, args);
      case "get_progress":
        return await getProgress(ctx);
      case "search_journal":
        return await searchJournal(ctx, args);
      default:
        return {
          text: `Unknown tool "${name}".`,
          summary: `unknown tool ${name}`,
        };
    }
  } catch (err) {
    return {
      text: `That lookup failed: ${err instanceof Error ? err.message : "unknown error"}`,
      summary: `${name} (failed)`,
    };
  }
}
