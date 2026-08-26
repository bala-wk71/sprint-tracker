import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateResponse } from "@/lib/ai/gemini";
import { gatherHealthContext } from "@/lib/ai/healthContext";
import { getHealthReportPrompt, type AiPersona } from "@/lib/ai/prompts";
import { todayIsoLocal } from "@/lib/dates";

/**
 * On-demand progress analysis.
 *
 * Unlike the daily and weekly comment routes this is user-triggered rather
 * than a cron, so it authenticates as the signed-in user and never touches
 * anyone else's data. Nothing is stored: the report is a reading of the
 * numbers at a moment, and a stale one saved in a table would be worse than
 * regenerating it.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [todayIso, { data: profile }] = await Promise.all([
    todayIsoLocal(),
    supabase.from("users").select("ai_persona").eq("id", user.id).single(),
  ]);

  const context = await gatherHealthContext(supabase, user.id, todayIso);

  if (context.includes("Nothing logged in the Health tab yet")) {
    return NextResponse.json(
      {
        error:
          "There is nothing to analyse yet. Log a few weigh-ins, a workout or two and a couple of days of food, then come back.",
      },
      { status: 400 }
    );
  }

  const persona: AiPersona = profile?.ai_persona ?? "rational";

  try {
    const report = await generateResponse(
      `${getHealthReportPrompt(persona)}\n\n## Their data\nToday is ${todayIso}.\n${context}`,
      [
        {
          role: "user",
          parts: [{ text: "How is my progress going?" }],
        },
      ],
      { temperature: 0.5, failOnTruncation: true }
    );

    return NextResponse.json({ report });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "The analysis failed." },
      { status: 500 }
    );
  }
}
