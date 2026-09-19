// Runs the roadmap importer against a Markdown file and prints what it
// extracted, without touching the database. Usage:
//   npx tsx scripts/try-import.ts path/to/roadmap.md [2026-09-19]
import { readFileSync, writeFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

async function main() {
  const [file, today = new Date().toISOString().slice(0, 10)] = process.argv.slice(2);
  const { generateJson } = await import("../lib/ai/gemini");
  const { getImportPrompt } = await import("../lib/ai/planning");
  const { PLAN_DRAFT_RESPONSE_SCHEMA, normalizeDraft, planDraftSchema } = await import("../lib/planning/draft");
  const { formatBand } = await import("../lib/planning/format");

  const started = Date.now();
  const raw = await generateJson(
    getImportPrompt(today, []),
    [{ role: "user", parts: [{ text: readFileSync(file, "utf8") }] }],
    PLAN_DRAFT_RESPONSE_SCHEMA,
    { temperature: 0.1, maxOutputTokens: 32768, thinkingBudget: Number(process.env.THINKING ?? 2048) }
  );
  const { draft, warnings } = normalizeDraft(planDraftSchema.parse(raw), today);
  writeFileSync(file.replace(/\.md$/, ".draft.json"), JSON.stringify(draft, null, 2));

  console.log(`${((Date.now() - started) / 1000).toFixed(0)}s · ${draft.streams.length} streams · ${draft.goals.length} goals`);
  console.log("Streams:", draft.streams.map((s) => s.name).join(", "));
  for (const g of draft.goals) {
    console.log(`\n[${g.streamKey}] ${g.title} (${g.level ?? "-"}, ${g.startDate} → ${g.targetDate})${g.parentKey ? ` under ${g.parentKey}` : ""}`);
    for (const m of g.measures) {
      const path = m.checkpoints.map((c) => `${c.date}: ${c.relative ? "Δ" : ""}${formatBand(c.min, c.max, m.unit)}${c.holdUntil ? ` hold→${c.holdUntil}` : ""}`);
      console.log(`  measure ${m.label} [${m.source}, ${m.direction}, ${m.interpolate}] base ${m.baselineValue ?? "?"} → ${path.join(" | ")}`);
      if (m.levels.length) console.log(`    levels: ${m.levels.map((l) => l.title).join(" / ")}`);
      if (m.source === "loan_schedule") console.log(`    loan: EMI ${m.loanEmi}, last ${m.loanLastEmiOn}`);
    }
    for (const l of g.levers) console.log(`  lever ${l.title} [${l.source}] ${l.target}/${l.period} (min ${l.floor})`);
    if (g.steps.length) console.log(`  steps: ${g.steps.length} (${g.steps.slice(0, 3).join("; ")}${g.steps.length > 3 ? "; …" : ""})`);
  }
  console.log("\nQuestions:", draft.questions);
  console.log("Warnings:", warnings);
  console.log(`Notes: ${draft.notes.length} chars`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
