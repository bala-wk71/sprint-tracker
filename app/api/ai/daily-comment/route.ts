import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { createServiceClient } from "@/lib/supabase/service";
import { generateResponse } from "@/lib/ai/gemini";
import { gatherDailyContext } from "@/lib/ai/context";
import { getDailyCommentPrompt, type AiPersona } from "@/lib/ai/prompts";
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
  const today = format(new Date(), "yyyy-MM-dd");

  const { data: logs } = await supabase
    .from("daily_logs")
    .select("id, owner_id")
    .eq("log_date", today);

  if (!logs || logs.length === 0) {
    return NextResponse.json({ message: "No daily logs to process" });
  }

  const results: { userId: string; ok: boolean; error?: string }[] = [];

  for (const log of logs) {
    try {
      // Check if AI already commented today
      const { data: existing } = await supabase
        .from("comments")
        .select("id")
        .eq("author_id", AI_USER_ID)
        .eq("target_type", "daily_log")
        .eq("target_id", log.id)
        .limit(1)
        .maybeSingle();

      if (existing) {
        results.push({ userId: log.owner_id, ok: true });
        continue;
      }

      const { data: userProfile } = await supabase
        .from("users")
        .select("ai_persona")
        .eq("id", log.owner_id)
        .single();
      const persona: AiPersona = userProfile?.ai_persona ?? "rational";

      const { context } = await gatherDailyContext(
        supabase,
        log.owner_id,
        today
      );

      if (!context) {
        results.push({ userId: log.owner_id, ok: true });
        continue;
      }

      const insight = await generateResponse(
        `${getDailyCommentPrompt(persona)}\n\n## Today's Data\n${context}`,
        [
          {
            role: "user",
            parts: [
              { text: "Generate the daily insight for this user's day." },
            ],
          },
        ]
      );

      await supabase.from("comments").insert({
        author_id: AI_USER_ID,
        owner_id: log.owner_id,
        target_type: "daily_log",
        target_id: log.id,
        body: insight,
      });

      results.push({ userId: log.owner_id, ok: true });

      // Rate limit: pause between users
      if (logs.indexOf(log) < logs.length - 1) {
        await new Promise((r) => setTimeout(r, 4000));
      }
    } catch (err) {
      results.push({
        userId: log.owner_id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
