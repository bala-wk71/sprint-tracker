"use client";

import { Plus, X } from "lucide-react";
import { INPUT } from "@/components/goals/GoalFormParts";
import type { LadderLevel } from "@/lib/planning/constants";

const SMALL = `${INPUT} h-9 px-2`;

/**
 * The levels of a skill (or any ladder): what "done" means at each rung and
 * what proves it, so a level is reached, not just claimed.
 */
export function LadderLevels({ levels, onChange }: { levels: LadderLevel[]; onChange: (levels: LadderLevel[]) => void }) {
  const update = (i: number, patch: Partial<LadderLevel>) =>
    onChange(levels.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium text-foreground">Levels</p>
        <p className="text-xs text-muted-foreground">What each level means, and the proof that you&apos;re there (a repo, a demo, a result).</p>
      </div>
      {levels.map((level, i) => (
        <div key={i} className="grid grid-cols-[3rem_minmax(0,1fr)_auto] gap-2 sm:grid-cols-[3rem_minmax(0,1.4fr)_minmax(0,1fr)_auto]">
          <span className="flex h-9 items-center justify-center rounded-md bg-muted text-sm font-semibold text-foreground">L{level.level}</span>
          <label className="sr-only" htmlFor={`lvl_title_${i}`}>Level {level.level} means</label>
          <input
            id={`lvl_title_${i}`}
            value={level.title}
            maxLength={120}
            placeholder="UART, I2C and SPI drivers from the datasheet"
            onChange={(e) => update(i, { title: e.target.value })}
            className={SMALL}
          />
          <label className="sr-only" htmlFor={`lvl_proof_${i}`}>Level {level.level} proof</label>
          <input
            id={`lvl_proof_${i}`}
            value={level.proof}
            maxLength={200}
            placeholder="Proof: repo + capture"
            onChange={(e) => update(i, { proof: e.target.value })}
            className={`${SMALL} col-span-2 col-start-2 row-start-2 sm:col-span-1 sm:col-start-auto sm:row-start-auto`}
          />
          <button
            type="button"
            onClick={() => onChange(levels.filter((_, j) => j !== i).map((l, j) => ({ ...l, level: j + 1 })))}
            aria-label={`Remove level ${level.level}`}
            className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      {levels.length < 12 && (
        <button
          type="button"
          onClick={() => onChange([...levels, { level: levels.length + 1, title: "", proof: "" }])}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
        >
          <Plus className="h-3.5 w-3.5" />
          Add level
        </button>
      )}
    </div>
  );
}
