import { cn } from "@/lib/utils";
import { phaseLabel, phaseWhen, type Phase } from "@/lib/planning/phases";

/** Every phase as one segment: done, the one being worked on, still to come. */
export function PhaseStrip({ phases }: { phases: Phase[] }) {
  return (
    <ol className="flex gap-1" aria-label="Phases">
      {phases.map((p) => (
        <li
          key={p.id}
          title={`${phaseLabel(p)} · ${phaseWhen(p)}`}
          className={cn(
            "h-1.5 flex-1 rounded-full",
            p.status === "done" && "bg-progress-good",
            p.status === "current" && "bg-primary",
            p.status === "upcoming" && "bg-muted"
          )}
        >
          <span className="sr-only">
            {phaseLabel(p)}: {p.status === "done" ? "done" : p.status === "current" ? "now" : "to come"}
          </span>
        </li>
      ))}
    </ol>
  );
}
