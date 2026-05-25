import { NextRequest, NextResponse } from "next/server";
import { format, startOfWeek } from "date-fns";
import { createServiceClient } from "@/lib/supabase/service";
import { generateResponse } from "@/lib/ai/gemini";
import { gatherWeeklyContext } from "@/lib/ai/context";
import { getWeeklyCommentPrompt, type AiPersona } from "@/lib/ai/prompts";
import { AI_USER_ID } from "@/lib/constants";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  const isAuthorized =
    (authHeader && authHeader === `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) ||
    (cronSecret && authHeader === `Bearer ${cronSecret}`);

  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const monday = format(
    startOfWeek(new Date(), { weekStartsOn: 1 }),
    "yyyy-MM-dd"
  );

  const { data: sprints } = await supabase
    .from("sprints")
    .select("id, owner_id")
    .eq("week_start_date", monday);

  if (!sprints || sprints.length === 0) {
    return NextResponse.json({ message: "No sprints to process" });
  }

  const results: { userId: string; ok: boolean; error?: string }[] = [];

  for (const sprint of sprints) {
    try {
      // Check if AI already commented on this sprint
      const { data: existing } = await supabase
        .from("comments")
        .select("id")
        .eq("author_id", AI_USER_ID)
        .eq("target_type", "sprint")
        .eq("target_id", sprint.id)
        .limit(1)
        .maybeSingle();

      if (existing) {
        results.push({ userId: sprint.owner_id, ok: true });
        continue;
      }

      const { data: userProfile } = await supabase
        .from("users")
        .select("ai_persona")
        .eq("id", sprint.owner_id)
        .single();
      const persona: AiPersona = userProfile?.ai_persona ?? "rational";

      const { context } = await gatherWeeklyContext(
        supabase,
        sprint.owner_id,
        monday
      );

      if (!context) {
        results.push({ userId: sprint.owner_id, ok: true });
        continue;
      }

      const summary = await generateResponse(
        `${getWeeklyCommentPrompt(persona)}\n\n## Sprint Data\n${context}`,
        [
          {
            role: "user",
            parts: [
              {
                text: "Generate the weekly sprint summary for this user.",
              },
            ],
          },
        ]
      );

      await supabase.from("comments").insert({
        author_id: AI_USER_ID,
        owner_id: sprint.owner_id,
        target_type: "sprint",
        target_id: sprint.id,
        body: summary,
      });

      results.push({ userId: sprint.owner_id, ok: true });

      if (sprints.indexOf(sprint) < sprints.length - 1) {
        await new Promise((r) => setTimeout(r, 4000));
      }
    } catch (err) {
      results.push({
        userId: sprint.owner_id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
