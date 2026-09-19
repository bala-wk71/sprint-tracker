// Writes a monthly report and a quarterly review from made-up numbers, to
// check the AI's wording without touching the database.
//   npx tsx scripts/try-report.ts [month|quarter|year]
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

async function main() {
  const period = (process.argv[2] ?? "month") as "month" | "quarter" | "year";
  const { generateJson } = await import("../lib/ai/gemini");
  const { getReportPrompt, reportResponseSchema, reportWordsSchema, proposalSchema } = await import("../lib/ai/reports");
  const { reportNumbersText } = await import("../lib/planning/reportText");
  type RN = import("../lib/planning/report").ReportNumbers;

  const weeks = ["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"];
  const numbers: RN = {
    period,
    start: period === "month" ? "2026-09-01" : period === "quarter" ? "2026-07-01" : "2026-01-01",
    end: period === "month" ? "2026-09-30" : period === "quarter" ? "2026-09-30" : "2026-12-31",
    asOf: period === "year" ? "2026-12-31" : "2026-09-30",
    label: period === "month" ? "September 2026" : period === "quarter" ? "Q3 2026" : "2026",
    inProgress: false,
    streams: [
      {
        id: "s1", name: "Health", area: "health", hoursDone: 0, hoursPlanned: null,
        measures: [{
          id: "m1", goalId: "g1", goalTitle: "Weight 80–83 kg, held steady", label: "Weight", unit: "kg", direction: "down",
          startValue: 94.6, endValue: 93.1, change: -1.5, band: { min: 92.6, max: 93.2 }, status: "on_track",
          headline: "1.9 kg down · on track for 89–90 kg by 31 Dec", covered: 0.3, best: 93.0,
          forecast: null, replan: false,
          checkpoints: period === "quarter" ? [{ date: "2026-09-30", label: "Q3 2026", target: "93–93.5 kg", value: 93.1, hit: true }] : [],
          earlier: null,
          movedIt: [{ leverId: "l1", leverTitle: "Strength sessions", target: 4, keptWeeks: 3, keptChange: -0.7, otherWeeks: 2, otherChange: -0.15, gain: 0.55 }],
          recent: { last4: -1.2, prev4: -0.6 }, due: false,
        }, {
          id: "m2", goalId: "g1", goalTitle: "Weight 80–83 kg, held steady", label: "Waist", unit: "cm", direction: "down",
          startValue: 104, endValue: 104, change: 0, band: { min: 101, max: 102 }, status: "catching_up",
          headline: "Holding at 104 cm · 2 cm to catch up for 98–100 cm by 31 Dec", covered: 0, best: 104,
          forecast: null, replan: false, checkpoints: [], earlier: null, movedIt: [], recent: null, due: true,
        }],
        levers: [
          { id: "l1", title: "Strength sessions", source: "workouts", goalTitle: "Weight 80–83 kg, held steady", period: "week", target: 4, floor: 2,
            counts: weeks.map((w, i) => ({ start: w, done: [4, 2, 4, 4, 3][i], partial: false })), complete: 5, kept: 3, floorKept: 5 },
          { id: "l2", title: "Protein 130 g+", source: "tick", goalTitle: "Weight 80–83 kg, held steady", period: "week", target: 7, floor: 5,
            counts: weeks.map((w, i) => ({ start: w, done: [5, 4, 6, 7, 3][i], partial: false })), complete: 5, kept: 1, floorKept: 3 },
        ],
        stepsDone: [{ title: "Book the blood test", goalTitle: "Q3 2026: health checks" }],
        stepsOpen: [{ title: "Get eyes checked", goalTitle: "Q3 2026: health checks" }], todosDone: 2,
        projects: [{ id: "p1", title: "Q3 2026: health checks", level: "quarter", targetDate: "2026-09-30", stepsDone: 1, stepsTotal: 2 }],
      },
      {
        id: "s2", name: "Dad's company", area: "work", hoursDone: 31, hoursPlanned: 40,
        measures: [{
          id: "m3", goalId: "g2", goalTitle: "Company profit ₹15 L/month", label: "Monthly profit", unit: "inr", direction: "up",
          startValue: 95000, endValue: 108000, change: 13000, band: { min: 104000, max: 104000 }, status: "ahead",
          headline: "₹13,000 up · ₹4,000 ahead of the path", covered: 0.02, best: 108000,
          forecast: null, replan: false, checkpoints: [], earlier: null, movedIt: [], recent: null, due: false,
        }],
        levers: [{ id: "l3", title: "Dealer visits", source: "tick", goalTitle: "Company profit ₹15 L/month", period: "week", target: 3, floor: 1,
          counts: weeks.map((w, i) => ({ start: w, done: [3, 1, 0, 2, 3][i], partial: false })), complete: 5, kept: 2, floorKept: 4 }],
        stepsDone: [], stepsOpen: [{ title: "Price list for the new SKU", goalTitle: "Q3 2026: new SKU" }], todosDone: 0,
        projects: [{ id: "p2", title: "Q3 2026: new SKU", level: "quarter", targetDate: "2026-09-30", stepsDone: 1, stepsTotal: 3 }],
      },
    ],
  };
  const quarterText = period === "quarter" ? `## Next quarter: Q4 2026 (1 Oct 2026 to 31 Dec 2026)
Destinations:
- D1: “Weight 80–83 kg, held steady” (stream Health; ends 30 Sep 2034). Path at 31 Dec 2026: Weight 89–90 kg, Waist 98–100 cm. Still open this quarter: “Get eyes checked”.
- D2: “Company profit ₹15 L/month” (stream Dad's company; ends 30 Sep 2034). Path at 31 Dec 2026: Monthly profit ₹1.1 L. Still open this quarter: “Price list for the new SKU”, “Trial order with 2 dealers”.` : "";
  const prompt = [reportNumbersText(numbers), quarterText].filter(Boolean).join("\n\n");
  console.log(prompt, "\n\n=====");
  const started = Date.now();
  const raw = await generateJson(getReportPrompt(period), [{ role: "user", parts: [{ text: prompt }] }], reportResponseSchema(period), {
    temperature: 0.4, maxOutputTokens: 8192, thinkingBudget: 1024,
  });
  console.log(`${((Date.now() - started) / 1000).toFixed(0)}s`);
  const words = reportWordsSchema.parse(raw);
  console.log(JSON.stringify(words, null, 2));
  if (period === "quarter") console.log(JSON.stringify(proposalSchema.parse((raw as { proposal?: unknown }).proposal), null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
