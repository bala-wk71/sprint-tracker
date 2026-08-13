"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, FileInput, Loader2 } from "lucide-react";
import { updatePage } from "./actions";

// Long, because a transcript arrives in one paste rather than keystroke by
// keystroke and can run to tens of kilobytes. This is a safety net under the
// blur save, not the main path.
const IDLE_SAVE_MS = 3000;

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

  // Mirrors of what the idle timer and the unmount flush need to read from
  // outside render.
  const latest = useRef(value);
  const savedRef = useRef(saved);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    latest.current = value;
    savedRef.current = saved;
  }, [value, saved]);

  // A transcript is pasted in one go rather than typed, so the main save is on
  // blur — no need to round-trip 50KB every 800ms. But blur alone meant the one
  // field in this feature that could lose work: paste, then navigate away
  // without clicking anything else, and it was gone. So an idle timer and an
  // unmount flush sit underneath it, the same pair the note body uses.
  const commit = async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (latest.current === savedRef.current) return;
    const snapshot = latest.current;
    setSaving(true);
    const result = await updatePage({ pageId, transcript: snapshot });
    if (result.ok) {
      savedRef.current = snapshot;
      setSaved(snapshot);
    }
    setSaving(false);
  };

  const onChange = (next: string) => {
    setValue(next);
    latest.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void commit(), IDLE_SAVE_MS);
  };

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (latest.current !== savedRef.current)
        void updatePage({ pageId, transcript: latest.current });
    };
  }, [pageId]);

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
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => void commit()}
            placeholder="Paste a transcript…"
            className="min-h-[200px] w-full resize-y rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      )}
    </div>
  );
}
