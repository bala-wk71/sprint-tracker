// Runs every AI feature once through its real prompt and schema, with sample
// data, and prints a short check of each answer. Nothing touches the database.
//   GEMINI_ONLY_MODEL=gemini-3.5-flash npx tsx scripts/try-all-ai.ts [feature ...]
// Features: meal, extract, enhance, review, lookback, health, daily, weekly,
// summary, chat, report. (coach: scripts/try-coach.ts; import: scripts/try-import.ts)
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
process.env.GEMINI_DEBUG = "1";

type Check = { name: string; ok: boolean; note: string; seconds: number };
const results: Check[] = [];
const short = (s: string, n = 400) => s.replace(/\s+/g, " ").trim().slice(0, n);

async function run(name: string, fn: () => Promise<{ ok: boolean; note: string }>) {
  const started = Date.now();
  try {
    const r = await fn();
    results.push({ name, ...r, seconds: Math.round((Date.now() - started) / 1000) });
  } catch (e) {
    results.push({ name, ok: false, note: `THREW: ${e instanceof Error ? e.message.slice(0, 200) : e}`, seconds: Math.round((Date.now() - started) / 1000) });
  }
  const last = results.at(-1)!;
  console.log(`\n=== ${name} ${last.ok ? "OK" : "PROBLEM"} (${last.seconds}s)\n${last.note}`);
}

async function main() {
  const only = process.argv.slice(2);
  const want = (f: string) => only.length === 0 || only.includes(f);
  const { generateJson, generateResponse, streamWithTools } = await import("../lib/ai/gemini");

  if (want("meal")) {
    const { MEAL_PARSE_RESPONSE_SCHEMA, getMealParsePrompt, mealParseResultSchema } = await import("../lib/ai/health");
    await run("Meal from text (Health > Eat)", async () => {
      const raw = await generateJson(
        getMealParsePrompt(["amma's sambar", "Egg bhurji"]),
        [{ role: "user", parts: [{ text: "3 idli with amma's sambar, a cup of filter coffee with sugar, and 2 boiled eggs" }] }],
        MEAL_PARSE_RESPONSE_SCHEMA
      );
      const r = mealParseResultSchema.safeParse(raw);
      if (!r.success) return { ok: false, note: "unreadable" };
      const kcal = r.data.items.reduce((n, i) => n + i.kcal, 0);
      const names = r.data.items.map((i) => `${i.qty} ${i.unit} ${i.name} (${Math.round(i.kcal)} kcal, ${Math.round(i.protein_g)} g P)`);
      const reuse = r.data.items.some((i) => i.name === "amma's sambar");
      return { ok: r.data.items.length >= 4 && kcal > 350 && kcal < 900 && reuse, note: `${names.join("; ")} = ${Math.round(kcal)} kcal; reused saved name: ${reuse}` };
    });
  }

  const notesBody = `Call with Ravi (dealer, Hosur) 18 Sep
- he wants 2 samples of the new SKU by end of month
- price: he pushed for 8% off on orders above 200 units, I said I'd check with dad
- payment terms 45 days, currently 30
- I need to send the updated price list by Tuesday
- Ravi to share last quarter's sales numbers
- next call early Oct`;

  if (want("extract")) {
    const { ACTION_ITEMS_RESPONSE_SCHEMA, actionItemsResultSchema, getExtractionPrompt, buildPageContext } = await import("../lib/ai/notes");
    await run("Notes: extract action items", async () => {
      const raw = await generateJson(
        getExtractionPrompt("Bala", "Saturday, 19 September 2026"),
        [{ role: "user", parts: [{ text: buildPageContext({ path: ["Dad's company"], title: "Ravi call", kind: "meeting", meetingDate: "2026-09-18", attendees: "Ravi", body: notesBody, transcript: null, existingItems: [] }) }] }],
        ACTION_ITEMS_RESPONSE_SCHEMA
      );
      const r = actionItemsResultSchema.safeParse(raw);
      if (!r.success) return { ok: false, note: `unreadable: ${JSON.stringify(raw).slice(0, 200)}` };
      return { ok: r.data.items.length >= 3, note: r.data.items.map((i) => JSON.stringify(i)).join("\n") };
    });
  }

  if (want("enhance")) {
    const { getEnhancePrompt, buildPageContext } = await import("../lib/ai/notes");
    await run("Notes: clean up", async () => {
      const text = await generateResponse(
        getEnhancePrompt("Bala", "Saturday, 19 September 2026"),
        [{ role: "user", parts: [{ text: buildPageContext({ path: [], title: "Ravi call", kind: "meeting", meetingDate: "2026-09-18", attendees: "Ravi", body: notesBody, transcript: null, existingItems: [] }) }] }],
        { failOnTruncation: true }
      );
      return { ok: text.length > 150 && /8%/.test(text) && /45/.test(text), note: short(text, 700) };
    });
  }

  if (want("review")) {
    const { getGoalReviewPrompt, buildGoalReviewContext, GOAL_REVIEW_RESPONSE_SCHEMA, goalReviewResultSchema } = await import("../lib/ai/goals");
    await run("Goal review", async () => {
      const context = buildGoalReviewContext({
        goal: { title: "Run 10K without stopping", why: "Health and energy", area: "health", length: "3 months", startDate: "2026-07-01", targetDate: "2026-09-30", status: "active", trackType: "steps", startValue: null, targetValue: null, currentValue: null, unit: null },
        steps: [
          { title: "Run 3K without stopping", doneAt: "2026-07-20T10:00:00Z" },
          { title: "Run 5K without stopping", doneAt: "2026-08-24T10:00:00Z" },
          { title: "Run 8K", doneAt: null },
          { title: "Run 10K", doneAt: null },
        ],
        checkins: [
          { date: "2026-09-14", onTrack: 6, value: null, note: null },
          { date: "2026-08-31", onTrack: 7, value: null, note: null },
        ],
        hours: { total: 18, last28: 4, lastWorkedOn: "2026-09-12" },
        linked: { tasks: 2, todos: 3, todosDone: 2 },
        previous: null,
      });
      const raw = await generateJson(
        `${getGoalReviewPrompt("rational", "2026-09-19", false)}\n\n## The goal and its data\n${context}`,
        [{ role: "user", parts: [{ text: "How am I doing on this goal?" }] }],
        GOAL_REVIEW_RESPONSE_SCHEMA,
        { temperature: 0.3 }
      );
      const r = goalReviewResultSchema.safeParse(raw);
      return r.success ? { ok: true, note: JSON.stringify(r.data) } : { ok: false, note: `unreadable: ${JSON.stringify(raw).slice(0, 300)}` };
    });
  }

  if (want("lookback")) {
    const { getLookBackPrompt, buildLookBackContext } = await import("../lib/ai/goals");
    await run("Journal look-back letter", async () => {
      const context = buildLookBackContext({
        monthLabel: "August 2026",
        entries: [
          { date: "2026-08-03", kind: "journal", mood: "tired", title: "Long week", body: "Office crunch all week. Skipped the gym twice. Dad called about the Hosur order, felt guilty I couldn't help.", goalTitle: null, onTrack: null },
          { date: "2026-08-17", kind: "journal", mood: "good", title: "", body: "Ran 5K without stopping for the first time! Legs dead but happy.", goalTitle: null, onTrack: null },
          { date: "2026-08-28", kind: "check_in", mood: null, title: "", body: "Two weekends on the drone board, finally got UART talking.", goalTitle: "Embedded Level 1", onTrack: 7 },
        ],
        reflections: [{ date: "2026-08-20", text: "Sleep before midnight made the whole day better." }],
        previousLetter: null,
      });
      const text = await generateResponse(
        `${getLookBackPrompt("rational", "August 2026")}\n\n## What they wrote\n${context}`,
        [{ role: "user", parts: [{ text: "Write my look-back for August 2026." }] }],
        { temperature: 0.6 }
      );
      return { ok: text.length > 200 && /5K|UART/i.test(text), note: short(text, 900) };
    });
  }

  if (want("health")) {
    const { getHealthReportPrompt } = await import("../lib/ai/prompts");
    await run("Health: analyse my progress", async () => {
      const context = `Goal: lose fat, keep muscle. Height 178 cm, male, 24.
Weigh-ins (7-day average): 1 Aug 95.2 kg, 15 Aug 94.4, 1 Sep 93.8, 18 Sep 93.1.
Body fat: 1 Aug 28%, 18 Sep 27%. Waist 1 Aug 103 cm, 18 Sep 101 cm.
Workouts last 4 weeks: 13 strength sessions (bench 60→65 kg x5, squat 80→90 kg x5).
Food, last 14 days logged 11: average 2150 kcal, protein 118 g (target 150 g).`;
      const text = await generateResponse(
        `${getHealthReportPrompt("rational")}\n\n## Their data\nToday is 2026-09-19.\n${context}`,
        [{ role: "user", parts: [{ text: "How is my progress going?" }] }],
        { temperature: 0.5, failOnTruncation: true }
      );
      return { ok: text.length > 200 && /protein/i.test(text), note: short(text, 900) };
    });
  }

  if (want("daily")) {
    const { getDailyCommentPrompt } = await import("../lib/ai/prompts");
    await run("Daily comment", async () => {
      const text = await generateResponse(
        `${getDailyCommentPrompt("rational")}\n\n## Today's Data\nDate: 2026-09-18 (Friday). Mood: good, energy 4/5. Intention: "finish the price list".\nHours: Dad's company price list 2.5h (Strong Signal), office sprint tickets 6h (Weak Signal), gym 1h (Personal).\nPriorities: price list (done), 2 tickets (1 done).`,
        [{ role: "user", parts: [{ text: "Generate the daily insight for this user's day." }] }]
      );
      return { ok: text.length > 60, note: short(text, 600) };
    });
  }

  if (want("weekly")) {
    const { getWeeklyCommentPrompt } = await import("../lib/ai/prompts");
    await run("Weekly comment", async () => {
      const text = await generateResponse(
        `${getWeeklyCommentPrompt("rational")}\n\n## Sprint Data\nWeek of 14 Sep 2026. Planned 20h, logged 17.5h.\nStrong Signal 9h (price list, dealer calls), Weak Signal 5h, Strong Noise 2h (meetings), Personal 1.5h.\nMood average 3.6/5. 4 of 6 priorities done.`,
        [{ role: "user", parts: [{ text: "Generate the weekly sprint summary for this user." }] }]
      );
      return { ok: text.length > 80, note: short(text, 600) };
    });
  }

  if (want("summary")) {
    await run("Chat: compact a long conversation", async () => {
      const text = await generateResponse(
        "Summarize this conversation concisely. Preserve key facts the user shared, decisions made, advice given, ongoing topics, and preferences. Keep under 500 words.",
        [{ role: "user", parts: [{ text: "user: I want to quit my IT job in 2030\nmodel: What needs to be true first?\nuser: company profit 3.5 L a month for 6 months, loans cleared, 12 months savings\nmodel: Good rules. Let's track profit monthly." }] }]
      );
      return { ok: /3\.5/.test(text) && /2030/.test(text), note: short(text, 500) };
    });
  }

  if (want("chat")) {
    const { toolDeclarations } = await import("../lib/ai/tools");
    const { getChatPrompt } = await import("../lib/ai/prompts");
    await run("Assistant chat with real tool definitions", async () => {
      const tools = toolDeclarations({
        supabase: null as never,
        userId: "x",
        todayIso: "2026-09-19",
        weekStartDay: 1,
        readsJournal: false,
      } as never);
      const called: string[] = [];
      let text = "";
      for await (const ev of streamWithTools(
        `${getChatPrompt("rational", false)}

## Briefing
Today is 2026-09-19. The user's week starts 2026-09-14.`,
        [{ role: "user", parts: [{ text: "How did my last 3 days go, and how is my weight trending?" }] }],
        tools,
        async (name, args) => {
          called.push(`${name}(${JSON.stringify(args)})`);
          if (/day/i.test(name)) return { text: "2026-09-16: mood ok, 7.5h logged (office 6h, price list 1.5h). 2026-09-17: mood good, 8h. 2026-09-18: mood good, energy 4, 9.5h incl. 2.5h price list.", summary: "days" };
          if (/body|weight|health/i.test(name)) return { text: "Weight 7-day avg: 1 Sep 93.8, 10 Sep 93.5, 18 Sep 93.1 kg.", summary: "weight" };
          return { text: "No data.", summary: name };
        }
      )) {
        if (ev.type === "text") text += ev.text;
        else if (ev.type === "reset") text = "";
      }
      return { ok: called.length > 0 && /93/.test(text), note: `tools: ${called.join(", ")}\n${short(text, 700)}` };
    });
  }

  if (want("report")) {
    await run("Plan report (monthly)", async () => {
      const { execSync } = await import("node:child_process");
      const out = execSync("npx tsx scripts/try-report.ts month", { env: process.env, encoding: "utf8" });
      const json = out.slice(out.indexOf("{"));
      return { ok: /"headline"/.test(json) && !/\\n/.test(json), note: short(json, 700) };
    });
  }

  console.log("\n\nSUMMARY");
  for (const r of results) console.log(`${r.ok ? "OK     " : "PROBLEM"} ${r.seconds}s  ${r.name}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
