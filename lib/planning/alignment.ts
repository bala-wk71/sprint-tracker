// How a week lines up with the goals: the sprint says it in one line, against
// the goals being worked on now (the current phase's, when there are phases).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { currentPhaseOf, loadPhases, phaseLabel } from "./phases";

type Client = SupabaseClient<Database>;

export const ALIGNMENTS = [
  { value: "aligned", label: "Aligned", hint: "Most of the week moves a goal" },
  { value: "partly", label: "Partly", hint: "Some of it does" },
  { value: "off", label: "Not this week", hint: "Other things come first, and that's a choice" },
] as const;

export type Alignment = (typeof ALIGNMENTS)[number]["value"];

export const ALIGNMENT_VALUES = ALIGNMENTS.map((a) => a.value) as [Alignment, ...Alignment[]];

export const alignmentLabel = (value: string | null) => ALIGNMENTS.find((a) => a.value === value)?.label ?? null;

export type AlignmentGoals = { phase: string | null; goals: { id: string; title: string }[] };

/**
 * The goals a week is weighed against: the current phase's when there is one,
 * otherwise every active goal that isn't long-range. Empty means no line is
 * asked for.
 */
export async function loadAlignmentGoals(supabase: Client, ownerId: string): Promise<AlignmentGoals> {
  const [phases, { data }] = await Promise.all([
    loadPhases(supabase, ownerId),
    supabase
      .from("goals")
      .select("id, title, level, phase_id")
      .eq("owner_id", ownerId)
      .eq("status", "active")
      .order("target_date"),
  ]);
  const current = currentPhaseOf(phases);
  const working = (data ?? []).filter((g) => g.level !== "destination");
  const inPhase = current ? working.filter((g) => g.phase_id === current.id) : [];
  const goals = inPhase.length > 0 ? inPhase : working;
  return {
    phase: current && inPhase.length > 0 ? phaseLabel(current) : null,
    goals: goals.map((g) => ({ id: g.id, title: g.title })),
  };
}
