"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";

/** Inline editor for a task's description. */
export function TaskNotes({
  value,
  onSave,
  onClose,
}: {
  value: string;
  onSave: (description: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const commit = () => {
    const next = draft.trim();
    if (next !== value.trim()) onSave(next);
    onClose();
  };

  return (
    <div className="ml-8 mt-1 space-y-1.5 pb-1">
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
        }}
        rows={3}
        placeholder="Notes, links, next step…"
        className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={commit}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground"
        >
          <Check className="h-3.5 w-3.5" />
          Save
        </button>
        <button
          onClick={onClose}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
          Cancel
        </button>
        <span className="text-[11px] text-muted-foreground">
          Ctrl+Enter saves · Esc discards
        </span>
      </div>
    </div>
  );
}
