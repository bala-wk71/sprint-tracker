// Replays a coach conversation against the real planner prompt, turn by
// turn, without touching the database. Shows which model answered, the
// reply, and whether a plan draft came back.
//   npx tsx scripts/try-coach.ts [health|business|skills] "first message" "second" ...
// GEMINI_ONLY=backup|primary limits the routes, to test one key's models.
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
if (process.env.GEMINI_ONLY === "backup") process.env.GEMINI_API_KEY = "";
if (process.env.GEMINI_ONLY === "primary") process.env.GEMINI_API_KEY_BACKUP = "";
process.env.GEMINI_DEBUG = "1";

async function main() {
  const [specialist = "health", ...turns] = process.argv.slice(2);
  const { generateJson } = await import("../lib/ai/gemini");
  const { getPlannerPrompt, PLANNER_TURN_SCHEMA } = await import("../lib/ai/planning");
  const { planDraftSchema } = await import("../lib/planning/draft");
  const today = "2026-09-19";
  // Roughly what the test account's context looks like.
  const context = [
    `Today: ${today}.`,
    "Streams: Health (5h/week planned); Side Business; Embedded Systems (5h/week planned).",
    "Active goals:",
    "- Achieve and maintain target weight [Health, destination] ends 2028-12-31",
    "- Grow side business profit [Side Business, destination] ends 2027-12-31",
    "Health profile: height 178 cm, sex male, born 2002-03-10, current body goal: lose.",
    "Latest body log (2026-09-18): weight 93.4 kg, body fat 27%, waist 101 cm.",
  ].join("\n");

  const history: { role: "user" | "model"; parts: { text: string }[] }[] = [];
  for (const t of turns) {
    history.push({ role: "user", parts: [{ text: t }] });
    const started = Date.now();
    const raw = (await generateJson(
      getPlannerPrompt(specialist as "health", today, context, null),
      history,
      PLANNER_TURN_SCHEMA,
      { temperature: Number(process.env.TEMP ?? 0.5), maxOutputTokens: 16384, thinkingBudget: 2048 }
    )) as { reply?: string; draft?: unknown };
    const draft = raw.draft ? planDraftSchema.safeParse(raw.draft) : null;
    console.log(`\n> ${t}\n< (${((Date.now() - started) / 1000).toFixed(0)}s) ${raw.reply}`);
    if (draft?.success && draft.data.goals.length) {
      console.log(`  DRAFT: ${draft.data.goals.map((g) => `${g.title} [${g.measures.length} targets, ${g.levers.length} actions, ${g.steps.length} steps]`).join("; ")}`);
    }
    history.push({ role: "model", parts: [{ text: raw.reply ?? "" }] });
  }
}
main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message.slice(0, 300) : e);
  process.exit(1);
});
