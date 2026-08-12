"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, FileInput, Loader2 } from "lucide-react";
import { updatePage } from "./actions";

export function TranscriptPanel({
  pageId,
  transcript,
}: {
  pageId: string;
  transcript: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(transcript ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(transcript ?? "");

  // A transcript is pasted in one go rather than typed, so it saves on blur
  // instead of on a debounce — no need to round-trip 50KB every 800ms.
  const commit = async () => {
    if (value === saved) return;
    setSaving(true);
    const result = await updatePage({ pageId, transcript: value });
    if (result.ok) setSaved(value);
    setSaving(false);
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        <FileInput className="h-4 w-4" />
        Transcript
        {saved.length > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">
            {saved.length.toLocaleString()} chars
          </span>
        )}
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      </button>

      {open && (
        <div className="space-y-2 border-t border-border p-4">
          <p className="text-xs text-muted-foreground">
            Paste the meeting transcript or chat log here. It stays out of the
            way but the AI reads it when extracting action items.
          </p>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => void commit()}
            placeholder="Paste a transcript…"
            className="min-h-[200px] w-full resize-y rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      )}
    </div>
  );
}
