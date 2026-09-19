"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { INPUT } from "@/components/goals/GoalFormParts";
import { logReading } from "@/app/(app)/goals/plan-actions";
import type { LadderLevel } from "@/lib/planning/constants";

const SMALL = `${INPUT} h-9 px-2`;

/** Log today's (or another day's) value. Ladders pick a level and add proof. */
export function LogReadingForm({
  measureId,
  goalId,
  unit,
  levels,
  todayIso,
  onDone,
}: {
  measureId: string;
  goalId: string;
  unit: string | null;
  levels: LadderLevel[] | null;
  todayIso: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [date, setDate] = useState(todayIso);
  const [note, setNote] = useState("");
  const [proof, setProof] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(value.replace(/,/g, ""));
    if (value.trim() === "" || Number.isNaN(n)) return setError(levels ? "Pick a level." : "Enter a number.");
    setError(null);
    startTransition(async () => {
      const result = await logReading({ measureId, goalId, measuredOn: date, value: n, note, proofUrl: proof });
      if (!result.ok) return setError(result.error);
      setValue("");
      setNote("");
      setProof("");
      onDone?.();
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {levels ? (
          <>
            <label htmlFor={`r_val_${measureId}`} className="sr-only">Level reached</label>
            <select id={`r_val_${measureId}`} value={value} onChange={(e) => setValue(e.target.value)} className={`${SMALL} w-auto min-w-40`}>
              <option value="">Level reached…</option>
              {levels.map((l) => (
                <option key={l.level} value={l.level}>
                  L{l.level}{l.title ? `: ${l.title}` : ""}
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            <label htmlFor={`r_val_${measureId}`} className="sr-only">Value</label>
            <input
              id={`r_val_${measureId}`}
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={unit === "inr" ? "Amount in ₹" : unit ? `Value in ${unit}` : "Value"}
              className={`${SMALL} w-36`}
            />
          </>
        )}
        <label htmlFor={`r_date_${measureId}`} className="sr-only">Date</label>
        <input id={`r_date_${measureId}`} type="date" max={todayIso} value={date} onChange={(e) => setDate(e.target.value)} className={`${SMALL} w-auto`} />
        <button type="submit" disabled={pending} className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {pending ? "Saving…" : "Log"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <label htmlFor={`r_note_${measureId}`} className="sr-only">Note</label>
        <input id={`r_note_${measureId}`} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className={`${SMALL} min-w-0 flex-1`} />
        {levels && (
          <>
            <label htmlFor={`r_proof_${measureId}`} className="sr-only">Proof link</label>
            <input id={`r_proof_${measureId}`} type="url" value={proof} maxLength={500} onChange={(e) => setProof(e.target.value)} placeholder="Proof link (repo, video)" className={`${SMALL} min-w-0 flex-1`} />
          </>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
