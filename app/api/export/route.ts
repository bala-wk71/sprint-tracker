import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/export?from=2025-01-01&to=2025-01-31
// Returns a CSV of daily logs + time entries for the authenticated owner.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  if (!from || !to || !ISO_DATE.test(from) || !ISO_DATE.test(to)) {
    return NextResponse.json(
      { error: "from and to query params are required (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  if (from > to) {
    return NextResponse.json(
      { error: "from must be <= to" },
      { status: 400 }
    );
  }

  // Fetch daily logs in range
  const { data: logs, error: logsErr } = await supabase
    .from("daily_logs")
    .select(
      "id, log_date, morning_mood, morning_energy, daily_intention, closing_mood, productivity_rating, reflection, improvement, win, gratitude"
    )
    .eq("owner_id", user.id)
    .gte("log_date", from)
    .lte("log_date", to)
    .order("log_date", { ascending: true });

  if (logsErr) {
    return NextResponse.json({ error: logsErr.message }, { status: 500 });
  }

  const logIds = (logs ?? []).map((l) => l.id);

  // Fetch time entries for those logs (only owner's own, RLS enforces this)
  let entries: Array<{
    daily_log_id: string;
    start_time: string | null;
    duration_hours: number;
    energy_during: number | null;
    notes: string | null;
    is_private: boolean;
    task_name: string | null;
    task_category: string | null;
  }> = [];

  if (logIds.length > 0) {
    const { data: entryRows, error: entryErr } = await supabase
      .from("time_entries")
      .select(
        "daily_log_id, start_time, duration_hours, energy_during, notes, is_private, tasks(name, category)"
      )
      .in("daily_log_id", logIds)
      .eq("owner_id", user.id)
      .order("start_time", { ascending: true, nullsFirst: false });

    if (entryErr) {
      return NextResponse.json({ error: entryErr.message }, { status: 500 });
    }

    entries = (entryRows ?? []).map((row) => {
      const task = Array.isArray(row.tasks) ? row.tasks[0] : row.tasks;
      return {
        daily_log_id: row.daily_log_id,
        start_time: row.start_time,
        duration_hours: Number(row.duration_hours),
        energy_during: row.energy_during,
        notes: row.notes,
        is_private: row.is_private,
        task_name: task?.name ?? null,
        task_category: task?.category ?? null,
      };
    });
  }

  // Build a map from log_id -> entries
  const entriesByLog = new Map<string, typeof entries>();
  for (const e of entries) {
    const list = entriesByLog.get(e.daily_log_id) ?? [];
    list.push(e);
    entriesByLog.set(e.daily_log_id, list);
  }

  // Produce CSV rows. One row per time entry; daily log columns repeated.
  // If a day has no time entries, emit one row with empty entry columns.
  const csvRows: string[] = [];
  csvRows.push(
    [
      "date",
      "morning_mood",
      "morning_energy",
      "daily_intention",
      "closing_mood",
      "productivity_rating",
      "reflection",
      "improvement",
      "win",
      "gratitude",
      "task_name",
      "task_category",
      "start_time",
      "duration_hours",
      "energy_during",
      "notes",
      "is_private",
    ].join(",")
  );

  for (const log of logs ?? []) {
    const dayEntries = entriesByLog.get(log.id) ?? [];
    const logCols = [
      csv(log.log_date),
      csv(log.morning_mood),
      csv(log.morning_energy),
      csv(log.daily_intention),
      csv(log.closing_mood),
      csv(log.productivity_rating),
      csv(log.reflection),
      csv(log.improvement),
      csv(log.win),
      csv(log.gratitude),
    ];

    if (dayEntries.length === 0) {
      csvRows.push([...logCols, "", "", "", "", "", "", ""].join(","));
    } else {
      for (const e of dayEntries) {
        csvRows.push(
          [
            ...logCols,
            csv(e.task_name),
            csv(e.task_category),
            csv(e.start_time),
            csv(e.duration_hours),
            csv(e.energy_during),
            csv(e.notes),
            csv(e.is_private),
          ].join(",")
        );
      }
    }
  }

  const body = csvRows.join("\r\n");
  const filename = `sprint-log-${from}-to-${to}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

// Escape a value for CSV: wrap in quotes if it contains comma, quote, or newline.
function csv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
