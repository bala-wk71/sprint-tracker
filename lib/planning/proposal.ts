// Next quarter's plan from a quarterly review: the AI names projects per
// destination, and this turns them into a plan draft (quarter goals under the
// existing destinations) for the same review-and-save screen as any other
// plan. Pure and client-safe.

import type { GoalArea } from "@/lib/goals/constants";
import { normalizeDraft, type DraftGoal, type PlanDraft } from "./draft";
import { quarterEndIso, quarterLabel, quarterStartIso, type Quarter } from "./quarters";

export type ProposalDestination = {
  ref: string;
  id: string;
  title: string;
  area: GoalArea;
  level: string | null;
  streamName: string | null;
  streamArea: GoalArea | null;
  startDate: string;
  targetDate: string;
  /** A goal for next quarter already under this destination: projects are added to it. */
  nextQuarterGoal: { id: string; title: string; steps: string[] } | null;
};

export type ProposalItem = { ref: string; title: string; projects: string[]; why: string };

const LEVELS = ["destination", "year", "quarter", "project"] as const;
const levelOf = (value: string | null) => (LEVELS as readonly string[]).includes(value ?? "") ? (value as DraftGoal["level"]) : null;

function stub(key: string, g: { id: string; title: string; area: GoalArea; level: string | null; startDate: string; targetDate: string }): DraftGoal {
  return {
    key,
    streamKey: null,
    parentKey: null,
    title: g.title,
    why: "",
    area: g.area,
    level: levelOf(g.level),
    startDate: g.startDate,
    targetDate: g.targetDate,
    steps: [],
    measures: [],
    levers: [],
    existingId: g.id,
    include: true,
  };
}

export function proposalDraft(
  items: ProposalItem[],
  destinations: ProposalDestination[],
  next: Quarter,
  todayIso: string
): { draft: PlanDraft; warnings: string[] } {
  const byRef = new Map(destinations.map((d) => [d.ref.toUpperCase(), d]));
  const streams: PlanDraft["streams"] = [];
  const streamKey = new Map<string, string>();
  const goals: DraftGoal[] = [];
  const used = new Set<string>();

  for (const item of items) {
    const dest = byRef.get(item.ref.trim().toUpperCase());
    if (!dest || used.has(dest.id)) continue;
    const existing = dest.nextQuarterGoal;
    const known = new Set((existing?.steps ?? []).map((s) => s.trim().toLowerCase()));
    const projects = [...new Set(item.projects.map((p) => p.trim()))].filter((p) => p && !known.has(p.toLowerCase()));
    if (projects.length === 0) continue;
    used.add(dest.id);

    let sKey: string | null = null;
    if (dest.streamName) {
      sKey = streamKey.get(dest.streamName) ?? `s${streamKey.size + 1}`;
      if (!streamKey.has(dest.streamName)) {
        streamKey.set(dest.streamName, sKey);
        streams.push({ key: sKey, name: dest.streamName, area: dest.streamArea ?? dest.area, weeklyHours: null, include: true });
      }
    }
    const destKey = `d-${dest.ref}`;
    goals.push({ ...stub(destKey, dest), streamKey: sKey });
    goals.push(
      existing
        ? {
            ...stub(`q-${dest.ref}`, {
              id: existing.id,
              title: existing.title,
              area: dest.area,
              level: "quarter",
              startDate: quarterStartIso(next),
              targetDate: quarterEndIso(next),
            }),
            parentKey: destKey,
            streamKey: sKey,
            steps: projects,
          }
        : {
            key: `q-${dest.ref}`,
            streamKey: sKey,
            parentKey: destKey,
            title: item.title.startsWith(quarterLabel(next)) ? item.title : `${quarterLabel(next)}: ${item.title}`,
            why: item.why,
            area: dest.area,
            level: "quarter",
            startDate: quarterStartIso(next),
            targetDate: quarterEndIso(next),
            steps: projects,
            measures: [],
            levers: [],
            existingId: null,
            include: true,
          }
    );
  }
  return normalizeDraft({ streams, goals, notes: "", questions: [] }, todayIso);
}
