"use client";

import { Trash2, TriangleAlert } from "lucide-react";
import { kcalFromMacros } from "@/lib/health/units";
import type { MealType } from "@/lib/health/constants";
import type { DraftItem } from "./types";

const NUM =
  "h-10 w-full rounded-md border border-border bg-background px-2 text-center text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary";

type Props = {
  draft: DraftItem[];
  mealType: MealType;
  saving: boolean;
  onEdit: (key: string, patch: Partial<DraftItem>) => void;
  onRemove: (key: string) => void;
  onSave: () => void;
  onDiscard: () => void;
};

/**
 * Every number is editable before anything is saved. An estimate the user can
 * see and correct is worth more than a precise-looking one they cannot.
 */
export function DraftEditor({
  draft,
  mealType,
  saving,
  onEdit,
  onRemove,
  onSave,
  onDiscard,
}: Props) {
  const totals = draft.reduce(
    (acc, d) => ({
      kcal: acc.kcal + d.kcal,
      protein: acc.protein + d.protein_g,
    }),
    { kcal: 0, protein: 0 }
  );

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">
          Check the numbers
        </h3>
        <span className="text-xs text-muted-foreground">
          {totals.kcal} kcal · {totals.protein}g protein
        </span>
      </div>

      <div className="mt-3 space-y-3">
        {draft.map((item) => {
          const implied = kcalFromMacros(item);
          // Macros that don't add up to the calories mean one of the two is
          // wrong, and the user is the only one who can say which.
          const inconsistent =
            item.kcal > 0 && Math.abs(implied - item.kcal) / item.kcal > 0.25;

          return (
            <div
              key={item.key}
              className="rounded-md border border-border bg-background p-3"
            >
              <div className="flex items-center gap-2">
                <input
                  value={item.name}
                  onChange={(e) => onEdit(item.key, { name: e.target.value })}
                  className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  aria-label="Food name"
                />
                <button
                  type="button"
                  onClick={() => onRemove(item.key)}
                  aria-label={`Remove ${item.name}`}
                  className="h-10 shrink-0 rounded-md px-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                <LabelledNumber
                  label="qty"
                  value={item.qty}
                  onChange={(v) => onEdit(item.key, { qty: v })}
                />
                <div>
                  <span className="mb-1 block text-[11px] text-muted-foreground">
                    unit
                  </span>
                  <input
                    value={item.unit}
                    onChange={(e) => onEdit(item.key, { unit: e.target.value })}
                    className={NUM}
                    aria-label="Unit"
                  />
                </div>
                <LabelledNumber
                  label="kcal"
                  value={item.kcal}
                  onChange={(v) => onEdit(item.key, { kcal: v })}
                />
                <LabelledNumber
                  label="protein"
                  value={item.protein_g}
                  onChange={(v) => onEdit(item.key, { protein_g: v })}
                />
                <LabelledNumber
                  label="carbs"
                  value={item.carbs_g}
                  onChange={(v) => onEdit(item.key, { carbs_g: v })}
                />
                <LabelledNumber
                  label="fat"
                  value={item.fat_g}
                  onChange={(v) => onEdit(item.key, { fat_g: v })}
                />
              </div>

              {(item.confidence === "low" || inconsistent) && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-[hsl(var(--progress-warning))]">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {inconsistent
                    ? `Macros work out to about ${Math.round(implied)} kcal — worth a look.`
                    : "Rough guess — the portion or the recipe is ambiguous."}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || draft.length === 0}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Saving…" : `Log ${mealType}`}
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Discard
        </button>
      </div>
    </div>
  );
}

function LabelledNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <span className="mb-1 block text-[11px] text-muted-foreground">
        {label}
      </span>
      <input
        type="number"
        inputMode="decimal"
        step="1"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) ? n : 0);
        }}
        className={NUM}
        aria-label={label}
      />
    </div>
  );
}
