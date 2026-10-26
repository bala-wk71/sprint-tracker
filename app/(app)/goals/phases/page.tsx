import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient, getUser } from "@/lib/supabase/server";
import { todayIsoLocal } from "@/lib/dates";
import { addDaysIso } from "@/lib/week";
import {
  currentPhaseOf,
  draftPhaseGoals,
  loadPhases,
  nextPhaseOf,
  phaseLabel,
  phaseWhen,
  stripYear,
} from "@/lib/planning/phases";
import { PhaseStrip } from "@/components/goals/phases/PhaseStrip";
import { PhaseForm, PhaseEditButton } from "@/components/goals/phases/PhaseForm";
import { StartPhaseButton } from "@/components/goals/phases/StartPhaseButton";

const STATUS_CHIP = {
  done: { label: "Done", tone: "bg-progress-good/15 text-[hsl(var(--progress-good))]" },
  current: { label: "Now", tone: "bg-primary/15 text-primary" },
  next: { label: "Next", tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  later: { label: "Later", tone: "bg-muted text-muted-foreground" },
};

export default async function PhasesPage() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const [phases, todayIso, { data: goalRows }, { data: streamRows }, { data: stepRows }] = await Promise.all([
    loadPhases(supabase, user.id),
    todayIsoLocal(),
    supabase.from("goals").select("id, title, status, level, stream_id, phase_id").eq("owner_id", user.id),
    supabase.from("streams").select("id, name, focus").eq("owner_id", user.id).is("archived_at", null).order("position"),
    supabase
      .from("goal_steps")
      .select("id, goal_id, phase_id, title, done_at, position")
      .eq("owner_id", user.id)
      .not("phase_id", "is", null)
      .order("position"),
  ]);
  const goals = goalRows ?? [];
  const streams = streamRows ?? [];
  const steps = stepRows ?? [];
  const current = currentPhaseOf(phases);
  const next = nextPhaseOf(phases);
  const streamName = new Map(streams.map((s) => [s.id, s.name]));
  const goalById = new Map(goals.map((g) => [g.id, g]));
  const openInCurrent = current
    ? goals.filter((g) => g.phase_id === current.id && (g.status === "active" || g.status === "paused"))
    : [];
  const nextPlan = next ? draftPhaseGoals(next, streams, goals, steps) : null;
  const last = phases[phases.length - 1];
  const newStart = last ? addDaysIso(last.endsOn, 1) : todayIso;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/goals" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" />
        Goals
      </Link>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Phases</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          A long plan, one stretch at a time. Only the current phase has goals of its own. Later phases are steps on
          your long-range goals, and become goals (one per push stream) when you start them.
        </p>
      </div>

      {phases.length > 0 && <PhaseStrip phases={phases} />}

      <ol className="space-y-3">
        {phases.map((p) => {
          const key = p.status === "upcoming" ? (p.id === next?.id ? "next" : "later") : p.status;
          const chip = STATUS_CHIP[key];
          const phaseGoals = goals.filter((g) => g.phase_id === p.id && g.level !== "destination");
          const planned = steps.filter((s) => s.phase_id === p.id && goalById.get(s.goal_id)?.level === "destination");
          const byStream = new Map<string, string[]>();
          for (const s of planned) {
            const name = streamName.get(goalById.get(s.goal_id)?.stream_id ?? "") ?? "No stream";
            byStream.set(name, [...(byStream.get(name) ?? []), stripYear(s.title)]);
          }
          return (
            <li key={p.id} className={cn("space-y-3 rounded-xl border bg-card p-4", p.status === "current" ? "border-primary/40" : "border-border")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{phaseLabel(p)}</p>
                  <p className="text-xs text-muted-foreground">{phaseWhen(p)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", chip.tone)}>{chip.label}</span>
                  <PhaseEditButton phase={p} />
                </div>
              </div>

              {phaseGoals.length > 0 && (
                <ul className="space-y-1">
                  {phaseGoals.map((g) => (
                    <li key={g.id} className="flex items-center justify-between gap-2 text-sm">
                      <Link href={`/goals/${g.id}`} className="min-w-0 truncate text-foreground hover:text-primary">
                        {g.title}
                      </Link>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {g.status === "active" ? "open" : g.status === "let_go" ? "let go" : g.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {p.status === "upcoming" && byStream.size > 0 && (
                <div className="space-y-2">
                  {[...byStream].map(([name, titles]) => (
                    <div key={name}>
                      <p className="text-xs font-medium text-muted-foreground">{name}</p>
                      <ul className="ml-4 list-disc text-sm text-foreground">
                        {titles.map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
              {p.status === "upcoming" && byStream.size === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nothing planned yet. On a long-range goal, set a step&apos;s phase to plan it here.
                </p>
              )}

              {p.id === next?.id && nextPlan && (
                <div className="space-y-2 border-t border-border pt-3">
                  {openInCurrent.length > 0 ? (
                    <div className="space-y-1 text-sm">
                      <p className="text-foreground">
                        Before {p.name} starts, close {current ? phaseLabel(current) : "the current phase"}&apos;s open goals:
                      </p>
                      <ul className="ml-4 list-disc">
                        {openInCurrent.map((g) => (
                          <li key={g.id}>
                            <Link href={`/goals/${g.id}`} className="text-primary hover:underline">
                              {g.title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-foreground">
                        {nextPlan.goals.length === 0
                          ? "Starting it creates no goals yet: no push stream has steps planned for it."
                          : `Starting it creates ${nextPlan.goals.map((g) => `“${g.title}” (${g.steps.length} ${g.steps.length === 1 ? "step" : "steps"})`).join(", ")}.`}
                      </p>
                      {nextPlan.waiting.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {nextPlan.waiting.map((w) => w.streamName).join(", ")} {nextPlan.waiting.length === 1 ? "is" : "are"} on
                          maintain, so {nextPlan.waiting.length === 1 ? "its steps stay" : "their steps stay"} on the long-range goal.
                        </p>
                      )}
                      <StartPhaseButton label={`Start ${phaseLabel(p)}`} />
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="rounded-xl border border-dashed border-border p-4">
        <p className="mb-3 text-sm font-medium text-foreground">{phases.length ? "Add a phase" : "Add your first phase"}</p>
        {/* Keyed on the suggested start, so after an add the form offers the
            stretch after the new last phase rather than repeating its dates. */}
        <PhaseForm key={newStart} defaults={{ startsOn: newStart, endsOn: addDaysIso(newStart, 364) }} />
      </div>
    </div>
  );
}
