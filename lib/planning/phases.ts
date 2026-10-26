// Phases: the roadmap walked one stretch at a time. Only the current phase
// has goals of its own; later phases are steps on the long-range goals until
// they start, so the active list stays short.

import { format } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export type PhaseStatus = "upcoming" | "current" | "done";

export type Phase = {
  id: string;
  position: number;
  name: string;
  startsOn: string;
  endsOn: string;
  status: PhaseStatus;
};

export const phaseLabel = (p: Pick<Phase, "position" | "name">) => `Phase ${p.position} · ${p.name}`;

const day = (iso: string) => new Date(`${iso}T00:00:00`);

/** "2027" for a calendar year, "2031–2034" for several, else the dates. */
export function phaseWhen(p: Pick<Phase, "startsOn" | "endsOn">): string {
  const fullYears = p.startsOn.endsWith("-01-01") && p.endsOn.endsWith("-12-31");
  const [from, to] = [p.startsOn.slice(0, 4), p.endsOn.slice(0, 4)];
  if (fullYears) return from === to ? from : `${from}–${to}`;
  if (from === to) return `${format(day(p.startsOn), "d MMM")} – ${format(day(p.endsOn), "d MMM yyyy")}`;
  return `${format(day(p.startsOn), "d MMM yyyy")} – ${format(day(p.endsOn), "d MMM yyyy")}`;
}

export const currentPhaseOf = (phases: Phase[]) => phases.find((p) => p.status === "current") ?? null;

/** The phase that starts next: the first one still upcoming. */
export const nextPhaseOf = (phases: Phase[]) =>
  [...phases].sort((a, b) => a.position - b.position).find((p) => p.status === "upcoming") ?? null;

/** "2027: Run 5K" → "Run 5K": inside its phase, the year says nothing new. */
export function stripYear(title: string): string {
  return title.replace(/^\d{4}(?:\s*[–-]\s*\d{4})?\s*:\s*/, "");
}

type DraftStream = { id: string; name: string; focus: string };
type DraftGoal = { id: string; stream_id: string | null; level: string | null; status: string };
type DraftStep = { id: string; goal_id: string; phase_id: string | null; title: string };

export type PhaseGoalDraft = {
  streamId: string;
  streamName: string;
  /** The long-range goal the new one sits under. */
  parentId: string;
  title: string;
  steps: string[];
};

/**
 * What starting a phase creates: one goal per push stream, holding the
 * phase's steps from that stream's long-range goals. Maintain streams get
 * none; their steps wait on the long-range goal.
 */
export function draftPhaseGoals(
  phase: Pick<Phase, "id" | "name">,
  streams: DraftStream[],
  goals: DraftGoal[],
  steps: DraftStep[]
): { goals: PhaseGoalDraft[]; waiting: { streamName: string; steps: string[] }[] } {
  const longRange = goals.filter((g) => g.level === "destination" && g.status === "active" && g.stream_id);
  const drafts: PhaseGoalDraft[] = [];
  const waiting: { streamName: string; steps: string[] }[] = [];
  for (const stream of streams) {
    const parents = longRange.filter((g) => g.stream_id === stream.id);
    const mine = steps.filter((s) => s.phase_id === phase.id && parents.some((g) => g.id === s.goal_id));
    if (mine.length === 0) continue;
    const titles = mine.map((s) => stripYear(s.title));
    if (stream.focus !== "push") {
      waiting.push({ streamName: stream.name, steps: titles });
      continue;
    }
    drafts.push({
      streamId: stream.id,
      streamName: stream.name,
      parentId: mine[0].goal_id,
      title: `${phase.name} · ${stream.name}`.slice(0, 120),
      steps: titles,
    });
  }
  return { goals: drafts, waiting };
}

export async function loadPhases(supabase: Client, ownerId: string): Promise<Phase[]> {
  const { data } = await supabase
    .from("plan_phases")
    .select("id, position, name, starts_on, ends_on, status")
    .eq("owner_id", ownerId)
    .order("position");
  return (data ?? []).map((p) => ({
    id: p.id,
    position: p.position,
    name: p.name,
    startsOn: p.starts_on,
    endsOn: p.ends_on,
    status: (["upcoming", "current", "done"].includes(p.status) ? p.status : "upcoming") as PhaseStatus,
  }));
}
