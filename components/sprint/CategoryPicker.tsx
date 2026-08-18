"use client";

import {
  CATEGORY_GRID,
  TASK_CATEGORIES,
  type TaskCategory,
} from "@/lib/constants";
import { CATEGORY_DOT_CLASSES } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * The 2x2, drawn as a 2x2.
 *
 * This replaced a bare <select> of five jargon labels. The words that resolve
 * "where does this go?" — each category's description and its priority verb —
 * already existed in TASK_CATEGORIES and were rendered nowhere, so the choice
 * was a guess between four names whose meaning is not in the names.
 *
 * Showing the axes as row and column headings is the point: you answer "is it
 * worth my week?", then "do I know how to start?", and the cell you land on is
 * the answer. Inferring that grid from four labels is the step people could
 * not do.
 *
 * The description of the *selected* cell is spelled out underneath rather than
 * inside every cell. Five descriptions in every task row would be a wall, and
 * putting them on hover would hide them exactly where they are needed most —
 * on a phone, where there is no hover.
 */

const CELL_TONE: Record<TaskCategory, { idle: string; active: string }> = {
  strong_signal: {
    idle: "border-strong-signal/30 hover:border-strong-signal/60 hover:bg-strong-signal/5",
    active: "border-strong-signal bg-strong-signal/15 ring-1 ring-strong-signal",
  },
  weak_signal: {
    idle: "border-weak-signal/30 hover:border-weak-signal/60 hover:bg-weak-signal/5",
    active: "border-weak-signal bg-weak-signal/15 ring-1 ring-weak-signal",
  },
  strong_noise: {
    idle: "border-strong-noise/30 hover:border-strong-noise/60 hover:bg-strong-noise/5",
    active: "border-strong-noise bg-strong-noise/15 ring-1 ring-strong-noise",
  },
  weak_noise: {
    idle: "border-weak-noise/30 hover:border-weak-noise/60 hover:bg-weak-noise/5",
    active: "border-weak-noise bg-weak-noise/15 ring-1 ring-weak-noise",
  },
  personal: {
    idle: "border-personal/30 hover:border-personal/60 hover:bg-personal/5",
    active: "border-personal bg-personal/15 ring-1 ring-personal",
  },
};

function Cell({
  category,
  selected,
  onSelect,
}: {
  category: TaskCategory;
  selected: boolean;
  onSelect: (category: TaskCategory) => void;
}) {
  const meta = TASK_CATEGORIES[category];
  const tone = CELL_TONE[category];

  return (
    <button
      type="button"
      onClick={() => onSelect(category)}
      aria-pressed={selected}
      title={`${meta.description} e.g. ${meta.example}`}
      className={cn(
        "flex min-w-0 flex-col gap-0.5 rounded-md border px-2 py-1.5 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
        selected ? tone.active : cn("bg-background", tone.idle)
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span
          aria-hidden
          className={cn(
            "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
            CATEGORY_DOT_CLASSES[category]
          )}
        />
        <span className="truncate text-xs font-semibold text-foreground">
          {meta.label}
        </span>
      </span>
      <span className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
        {meta.priority}
      </span>
    </button>
  );
}

export function CategoryPicker({
  value,
  onChange,
  className,
}: {
  value: TaskCategory;
  onChange: (category: TaskCategory) => void;
  className?: string;
}) {
  const aside = CATEGORY_GRID.aside;
  const selected = TASK_CATEGORIES[value];

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-1.5">
        {/* Column headings state the clarity axis. */}
        <span className="text-[11px] text-muted-foreground">
          {CATEGORY_GRID.clarityAxis.label}
        </span>
        <span className="px-1 text-[11px] font-medium text-foreground">
          {CATEGORY_GRID.clarityAxis.yes}
        </span>
        <span className="px-1 text-[11px] font-medium text-foreground">
          {CATEGORY_GRID.clarityAxis.no}
        </span>

        {CATEGORY_GRID.rows.map((row) => (
          <div key={row.value} className="contents">
            {/* Row heading states the value axis. Kept horizontal — rotated
                text is harder to read than the two words are wide. */}
            <span className="whitespace-nowrap pr-1 text-[11px] font-medium text-muted-foreground">
              {row.value === "yes"
                ? CATEGORY_GRID.valueAxis.yes
                : CATEGORY_GRID.valueAxis.no}
            </span>
            {row.cells.map((category) => (
              <Cell
                key={category}
                category={category}
                selected={value === category}
                onSelect={onChange}
              />
            ))}
          </div>
        ))}

        {/* Personal is not a point on the grid — it is a fixed cost you are
            protecting, and the signal ratio excludes it — so it sits beside
            the grid rather than in it. */}
        <span className="whitespace-nowrap pr-1 text-[11px] text-muted-foreground">
          or
        </span>
        <div className="col-span-2">
          <Cell
            category={aside}
            selected={value === aside}
            onSelect={onChange}
          />
        </div>
      </div>

      <p className="text-[11px] leading-snug text-muted-foreground">
        <span className="font-medium text-foreground">{selected.label}</span>{" "}
        — {selected.description} <span className="opacity-75">e.g. {selected.example}</span>
      </p>
    </div>
  );
}
