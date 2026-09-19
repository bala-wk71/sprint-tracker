import { NextResponse } from "next/server";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { generateResponse } from "@/lib/ai/gemini";
import { buildLookBackContext, getLookBackPrompt } from "@/lib/ai/goals";
import type { AiPersona } from "@/lib/ai/prompts";
import { todayIsoLocal } from "@/lib/dates";

/**
 * The monthly look-back: a short letter about last month, written into the
 * journal as a coach entry.
 *
 * Only when asked, and only with the user's permission to read the journal.
 * One per month — it is dated the last day of the month it describes, which
 * both places it at the top of that month in the timeline and makes a second
 * request for the same month easy to spot.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const todayIso = await todayIsoLocal();
  const lastMonth = subMonths(new Date(`${todayIso}T00:00:00`), 1);
  const monthStart = format(startOfMonth(lastMonth), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(lastMonth), "yyyy-MM-dd");
  const monthLabel = format(lastMonth, "MMMM yyyy");

  const [{ data: profile }, { data: existing }] = await Promise.all([
    supabase.from("users").select("ai_persona, coach_reads_journal").eq("id", user.id).single(),
    supabase
      .from("journal_entries")
      .select("id")
      .eq("owner_id", user.id)
      .eq("kind", "look_back")
      .eq("entry_date", monthEnd)
      .maybeSingle(),
  ]);

  if (!profile?.coach_reads_journal) {
    return NextResponse.json(
      { error: "The coach can only write a look-back once you let it read your journal. Turn that on in Settings." },
      { status: 403 }
    );
  }
  if (existing) {
    return NextResponse.json(
      { error: `Your ${monthLabel} look-back is already in your journal.`, id: existing.id },
      { status: 409 }
    );
  }

  const [{ data: entries }, { data: logs }, { data: previous }] = await Promise.all([
    supabase
      .from("journal_entries")
      .select("entry_date, kind, mood, title, body, on_track, goals(title)")
      .eq("owner_id", user.id)
      .eq("author", "owner")
      .eq("hide_from_coach", false)
      .in("kind", ["entry", "check_in"])
      .gte("entry_date", monthStart)
      .lte("entry_date", monthEnd)
      .order("entry_date", { ascending: true })
      .limit(120),
    supabase
      .from("daily_logs")
      .select("log_date, reflection, reflection_private, win")
      .eq("owner_id", user.id)
      .gte("log_date", monthStart)
      .lte("log_date", monthEnd)
      .order("log_date", { ascending: true }),
    supabase
      .from("journal_entries")
      .select("entry_date, body")
      .eq("owner_id", user.id)
      .eq("kind", "look_back")
      .lt("entry_date", monthEnd)
      .order("entry_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const reflections = (logs ?? []).flatMap((log) => {
    // A reflection marked private stays out, even with the journal switch on.
    const text = [log.reflection_private ? null : log.reflection, log.win ? `Win: ${log.win}` : null]
      .filter(Boolean)
      .join(" ");
    return text.trim() ? [{ date: log.log_date, text }] : [];
  });
  const rows = entries ?? [];

  if (rows.length === 0 && reflections.length === 0) {
    return NextResponse.json(
      { error: `There's nothing from ${monthLabel} to look back on yet.` },
      { status: 400 }
    );
  }

  const context = buildLookBackContext({
    monthLabel,
    entries: rows.map((e) => {
      const goal = e.goals as { title: string } | { title: string }[] | null;
      return {
        date: e.entry_date,
        kind: e.kind,
        mood: e.mood,
        title: e.title,
        body: e.body,
        goalTitle: (Array.isArray(goal) ? goal[0] : goal)?.title ?? null,
        onTrack: e.on_track,
      };
    }),
    reflections,
    previousLetter: previous ? { date: previous.entry_date, body: previous.body } : null,
  });

  const persona: AiPersona = profile.ai_persona ?? "rational";

  try {
    const letter = await generateResponse(
      `${getLookBackPrompt(persona, monthLabel)}\n\n## What they wrote\n${context}`,
      [{ role: "user", parts: [{ text: `Write my look-back for ${monthLabel}.` }] }],
      { temperature: 0.6, quality: "good" }
    );
    if (!letter.trim()) {
      return NextResponse.json({ error: "The coach came back empty-handed. Try again." }, { status: 502 });
    }

    const { data: saved, error } = await supabase
      .from("journal_entries")
      .insert({
        owner_id: user.id,
        entry_date: monthEnd,
        title: `Look-back: ${monthLabel}`,
        body: letter.trim().slice(0, 20000),
        kind: "look_back",
        author: "coach",
        is_private: true,
      })
      .select("id")
      .single();
    if (error || !saved) {
      return NextResponse.json({ error: "Couldn't save the look-back. Try again." }, { status: 500 });
    }

    return NextResponse.json({ id: saved.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "The look-back failed." },
      { status: 500 }
    );
  }
}
