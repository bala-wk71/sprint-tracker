import { format, subDays } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { gatherHealthContext } from "./healthContext";
import {
  DEFAULT_WEEK_START_DAY,
  addDaysIso,
  weekEndIsoOf,
  weekStartIsoOf,
  type WeekStartDay,
} from "@/lib/week";

type Client = SupabaseClient<Database>;

export async function gatherChatContext(
  supabase: Client,
  userId: string,
  weekStartDay: WeekStartDay = DEFAULT_WEEK_START_DAY
): Promise<string> {
  const today = format(new Date(), "yyyy-MM-dd");
  const weekStart = weekStartIsoOf(today, weekStartDay);
  const lastWeekStart = addDaysIso(weekStart, -7);

  const [sprint, lastWeekSprint, dailyLog, recentLogs, health] =
    await Promise.all([
      getCurrentSprint(supabase, userId, weekStart),
      getCurrentSprint(supabase, userId, lastWeekStart),
      getDailyLog(supabase, userId, today),
      getRecentDailyLogs(supabase, userId, 14),
      gatherHealthContext(supabase, userId, today),
    ]);

  const sections: string[] = [];
  sections.push(`Today: ${today}`);

  if (sprint) {
    sections.push(`\n## Current Sprint (week of ${weekStart})`);
    sections.push(`Tasks: ${sprint.tasks.length}`);
    for (const t of sprint.tasks) {
      const hours = t.logged_hours ?? 0;
      const pct = t.target_hours > 0 ? Math.round((hours / t.target_hours) * 100) : 0;
      sections.push(
        `- [${t.category}] ${t.name}: target ${t.target_hours}h, logged ${hours}h (${pct}%)`
      );
    }
  }

  if (lastWeekSprint) {
    const totalTarget = lastWeekSprint.tasks.reduce((s, t) => s + t.target_hours, 0);
    const totalLogged = lastWeekSprint.tasks.reduce((s, t) => s + (t.logged_hours ?? 0), 0);
    const pct = totalTarget > 0 ? Math.round((totalLogged / totalTarget) * 100) : 0;
    sections.push(`\n## Last Week Sprint (week of ${lastWeekStart})`);
    sections.push(`Overall: ${totalLogged.toFixed(1)}h / ${totalTarget}h (${pct}%)`);
    for (const t of lastWeekSprint.tasks) {
      const hours = t.logged_hours ?? 0;
      const taskPct = t.target_hours > 0 ? Math.round((hours / t.target_hours) * 100) : 0;
      sections.push(
        `- [${t.category}] ${t.name}: ${hours}h/${t.target_hours}h (${taskPct}%)`
      );
    }
  }

  if (dailyLog) {
    sections.push(`\n## Today's Log`);
    if (dailyLog.morning_mood)
      sections.push(`Morning mood: ${dailyLog.morning_mood}`);
    if (dailyLog.morning_energy)
      sections.push(`Morning energy: ${dailyLog.morning_energy}/5`);
    if (dailyLog.daily_intention)
      sections.push(`Intention: ${dailyLog.daily_intention}`);
    if (dailyLog.closing_mood)
      sections.push(`Evening mood: ${dailyLog.closing_mood}`);
    if (dailyLog.productivity_rating)
      sections.push(`Productivity: ${dailyLog.productivity_rating}/5`);

    if (dailyLog.priorities.length > 0) {
      sections.push(`Priorities:`);
      for (const p of dailyLog.priorities) {
        sections.push(`- ${p.description}: ${p.status}`);
      }
    }

    if (dailyLog.time_entries.length > 0) {
      const totalHours = dailyLog.time_entries.reduce(
        (s, e) => s + e.duration_hours,
        0
      );
      sections.push(`Time entries (${totalHours.toFixed(1)}h total):`);
      for (const e of dailyLog.time_entries) {
        sections.push(
          `- ${e.task_name ?? "Unlinked"} (${e.category ?? "unknown"}): ${e.duration_hours}h`
        );
      }
    }
  }

  sections.push(`\n${health}`);

  if (recentLogs.length > 0) {
    sections.push(`\n## Past 2 Weeks Daily Logs`);
    for (const log of recentLogs) {
      const parts: string[] = [`${log.log_date}:`];
      if (log.morning_mood) parts.push(`mood=${log.morning_mood}`);
      if (log.morning_energy) parts.push(`energy=${log.morning_energy}`);
      if (log.productivity_rating)
        parts.push(`productivity=${log.productivity_rating}`);
      if (log.total_hours) parts.push(`${log.total_hours.toFixed(1)}h logged`);
      sections.push(parts.join(" "));
    }
  }

  return sections.join("\n");
}

export async function gatherDailyContext(
  supabase: Client,
  userId: string,
  date: string,
  weekStartDay: WeekStartDay = DEFAULT_WEEK_START_DAY
): Promise<{ context: string; dailyLogId: string | null }> {
  const weekStart = weekStartIsoOf(date, weekStartDay);

  const [sprint, dailyLog, weekLogs] = await Promise.all([
    getCurrentSprint(supabase, userId, weekStart),
    getDailyLog(supabase, userId, date),
    getWeekDailyLogs(supabase, userId, weekStart),
  ]);

  if (!dailyLog) return { context: "", dailyLogId: null };

  const sections: string[] = [];
  sections.push(`Date: ${date}`);

  if (dailyLog.morning_mood)
    sections.push(`Morning mood: ${dailyLog.morning_mood}`);
  if (dailyLog.morning_energy)
    sections.push(`Morning energy: ${dailyLog.morning_energy}/5`);
  if (dailyLog.daily_intention)
    sections.push(`Intention: ${dailyLog.daily_intention}`);
  if (dailyLog.closing_mood)
    sections.push(`Evening mood: ${dailyLog.closing_mood}`);
  if (dailyLog.productivity_rating)
    sections.push(`Productivity: ${dailyLog.productivity_rating}/5`);
  if (dailyLog.reflection && !dailyLog.reflection_private)
    sections.push(`Reflection: ${dailyLog.reflection}`);
  if (dailyLog.improvement)
    sections.push(`Improvement: ${dailyLog.improvement}`);
  if (dailyLog.win) sections.push(`Win: ${dailyLog.win}`);
  if (dailyLog.gratitude && !dailyLog.gratitude_private)
    sections.push(`Gratitude: ${dailyLog.gratitude}`);

  if (dailyLog.priorities.length > 0) {
    sections.push(`\nPriorities:`);
    for (const p of dailyLog.priorities) {
      sections.push(`- ${p.description}: ${p.status}`);
    }
  }

  if (dailyLog.time_entries.length > 0) {
    const totalHours = dailyLog.time_entries.reduce(
      (s, e) => s + e.duration_hours,
      0
    );
    sections.push(`\nTime logged: ${totalHours.toFixed(1)}h`);
    for (const e of dailyLog.time_entries) {
      sections.push(
        `- ${e.task_name ?? "Unlinked"} (${e.category ?? "unknown"}): ${e.duration_hours}h`
      );
    }
  }

  if (sprint) {
      const totalTarget = sprint.tasks.reduce((s, t) => s + t.target_hours, 0);
    const totalLogged = sprint.tasks.reduce((s, t) => s + (t.logged_hours ?? 0), 0);
    const pct = totalTarget > 0 ? Math.round((totalLogged / totalTarget) * 100) : 0;
    sections.push(
      `\nSprint progress: ${totalLogged.toFixed(1)}h / ${totalTarget}h (${pct}%)`
    );
  }

  if (weekLogs.length > 1) {
    sections.push(`\nWeek trend:`);
    for (const log of weekLogs) {
      if (log.log_date === date) continue;
      const parts: string[] = [`${log.log_date}:`];
      if (log.morning_mood) parts.push(`mood=${log.morning_mood}`);
      if (log.productivity_rating)
        parts.push(`productivity=${log.productivity_rating}`);
      if (log.total_hours) parts.push(`${log.total_hours.toFixed(1)}h`);
      sections.push(parts.join(" "));
    }
  }

  return { context: sections.join("\n"), dailyLogId: dailyLog.id };
}

export async function gatherWeeklyContext(
  supabase: Client,
  userId: string,
  weekStart: string
): Promise<{ context: string; sprintId: string | null }> {
  const [sprint, weekLogs, health] = await Promise.all([
    getCurrentSprint(supabase, userId, weekStart),
    getWeekDailyLogs(supabase, userId, weekStart),
    // Anchored on the end of the week being summarised, not on today, so a
    // summary generated late still describes the week it is about.
    gatherHealthContext(supabase, userId, weekEndIsoOf(weekStart)),
  ]);

  if (!sprint) return { context: "", sprintId: null };

  const sections: string[] = [];
  sections.push(`Sprint week: ${weekStart}`);

  const totalTargetHours = sprint.tasks.reduce(
    (s, t) => s + t.target_hours,
    0
  );
  const totalLoggedHours = sprint.tasks.reduce(
    (s, t) => s + (t.logged_hours ?? 0),
    0
  );
  const hoursPct = totalTargetHours > 0 ? Math.round((totalLoggedHours / totalTargetHours) * 100) : 0;

  sections.push(`Tasks: ${sprint.tasks.length} total`);
  sections.push(
    `Hours: ${totalLoggedHours.toFixed(1)}h logged / ${totalTargetHours}h target (${hoursPct}%)`
  );

  const categoryBreakdown: Record<string, number> = {};
  for (const t of sprint.tasks) {
    categoryBreakdown[t.category] =
      (categoryBreakdown[t.category] ?? 0) + (t.logged_hours ?? 0);
  }
  sections.push(`\nCategory breakdown:`);
  for (const [cat, hours] of Object.entries(categoryBreakdown)) {
    sections.push(`- ${cat}: ${hours.toFixed(1)}h`);
  }

  sections.push(`\nTasks:`);
  for (const t of sprint.tasks) {
    const loggedH = t.logged_hours ?? 0;
    const taskPct = t.target_hours > 0 ? Math.round((loggedH / t.target_hours) * 100) : 0;
    sections.push(
      `- [${t.category}] ${t.name}: ${loggedH}h/${t.target_hours}h (${taskPct}%)`
    );
  }

  if (weekLogs.length > 0) {
    sections.push(`\nDaily logs:`);
    for (const log of weekLogs) {
      const parts: string[] = [`${log.log_date}:`];
      if (log.morning_mood) parts.push(`mood=${log.morning_mood}`);
      if (log.closing_mood) parts.push(`evening=${log.closing_mood}`);
      if (log.productivity_rating)
        parts.push(`productivity=${log.productivity_rating}`);
      if (log.total_hours) parts.push(`${log.total_hours.toFixed(1)}h`);
      sections.push(parts.join(" "));
    }
  }

  sections.push(`\n${health}`);

  return { context: sections.join("\n"), sprintId: sprint.id };
}

async function getCurrentSprint(
  supabase: Client,
  userId: string,
  weekStart: string
) {
  const { data: sprint } = await supabase
    .from("sprints")
    .select("id, tasks(id, name, category, target_hours, position)")
    .eq("owner_id", userId)
    .eq("week_start_date", weekStart)
    .maybeSingle();

  if (!sprint) return null;

  const taskIds = sprint.tasks.map((t) => t.id);
  const loggedByTask: Record<string, number> = {};

  if (taskIds.length > 0) {
    const { data: entries } = await supabase
      .from("time_entries")
      .select("task_id, duration_hours")
      .in("task_id", taskIds)
      .eq("is_private", false);

    for (const e of entries ?? []) {
      if (e.task_id) {
        loggedByTask[e.task_id] =
          (loggedByTask[e.task_id] ?? 0) + Number(e.duration_hours);
      }
    }
  }

  return {
    id: sprint.id,
    tasks: sprint.tasks
      .sort((a, b) => a.position - b.position)
      .map((t) => ({
        ...t,
        target_hours: Number(t.target_hours),
        logged_hours: loggedByTask[t.id] ?? 0,
      })),
  };
}

async function getDailyLog(
  supabase: Client,
  userId: string,
  date: string
) {
  const { data: log } = await supabase
    .from("daily_logs")
    .select(
      "id, morning_mood, morning_energy, daily_intention, closing_mood, productivity_rating, reflection, reflection_private, improvement, win, gratitude, gratitude_private"
    )
    .eq("owner_id", userId)
    .eq("log_date", date)
    .maybeSingle();

  if (!log) return null;

  const [{ data: priorities }, { data: entries }] = await Promise.all([
    supabase
      .from("priorities")
      .select("description, status")
      .eq("daily_log_id", log.id)
      .order("position"),
    supabase
      .from("time_entries")
      .select("task_id, duration_hours, tasks(name, category)")
      .eq("daily_log_id", log.id)
      .eq("is_private", false)
      .order("created_at"),
  ]);

  return {
    ...log,
    priorities: (priorities ?? []).map((p) => ({
      description: p.description,
      status: p.status,
    })),
    time_entries: (entries ?? []).map((e) => {
      const task = Array.isArray(e.tasks) ? e.tasks[0] : e.tasks;
      return {
        task_name: task?.name ?? null,
        category: task?.category ?? null,
        duration_hours: Number(e.duration_hours),
      };
    }),
  };
}

async function getRecentDailyLogs(
  supabase: Client,
  userId: string,
  days: number
) {
  const from = format(subDays(new Date(), days), "yyyy-MM-dd");

  const { data: logs } = await supabase
    .from("daily_logs")
    .select(
      "id, log_date, morning_mood, morning_energy, productivity_rating"
    )
    .eq("owner_id", userId)
    .gte("log_date", from)
    .order("log_date", { ascending: false });

  const result = [];
  for (const log of logs ?? []) {
    const { data: entries } = await supabase
      .from("time_entries")
      .select("duration_hours")
      .eq("daily_log_id", log.id)
      .eq("is_private", false);

    const totalHours = (entries ?? []).reduce(
      (s, e) => s + Number(e.duration_hours),
      0
    );

    result.push({ ...log, total_hours: totalHours });
  }

  return result;
}

async function getWeekDailyLogs(
  supabase: Client,
  userId: string,
  weekStart: string
) {
  const weekEnd = weekEndIsoOf(weekStart);

  const { data: logs } = await supabase
    .from("daily_logs")
    .select(
      "id, log_date, morning_mood, closing_mood, morning_energy, productivity_rating"
    )
    .eq("owner_id", userId)
    .gte("log_date", weekStart)
    .lte("log_date", weekEnd)
    .order("log_date");

  const result = [];
  for (const log of logs ?? []) {
    const { data: entries } = await supabase
      .from("time_entries")
      .select("duration_hours")
      .eq("daily_log_id", log.id)
      .eq("is_private", false);

    const totalHours = (entries ?? []).reduce(
      (s, e) => s + Number(e.duration_hours),
      0
    );

    result.push({ ...log, total_hours: totalHours });
  }

  return result;
}
