"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Eye, Loader2, Pencil, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/shared/Markdown";
import { updatePage } from "./actions";

const AUTOSAVE_MS = 800;

type Tab = "write" | "preview" | "enhanced";
type Status = "saved" | "saving" | "error";

export function NoteEditor({
  pageId,
  body,
  enhancedBody,
}: {
  pageId: string;
  body: string;
  enhancedBody: string | null;
}) {
  const [value, setValue] = useState(body);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<Status>("saved");
  const [tab, setTab] = useState<Tab>("write");

  // Only take a fresh server body when there is nothing unsaved locally —
  // a router.refresh() triggered by some other control must not wipe out
  // characters typed in the last few hundred milliseconds.
  const [serverBody, setServerBody] = useState(body);
  if (body !== serverBody) {
    setServerBody(body);
    if (!dirty) setValue(body);
  }

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirrors of the two values the debounce timer and the unmount flush need to
  // read outside of render.
  const latest = useRef(value);
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    latest.current = value;
    dirtyRef.current = dirty;
  }, [value, dirty]);

  const save = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!dirtyRef.current) return;

    const snapshot = latest.current;
    setStatus("saving");
    const result = await updatePage({ pageId, body: snapshot });
    if (!result.ok) {
      setStatus("error");
      return;
    }
    // Anything typed while the request was in flight is still unsaved.
    if (latest.current === snapshot) {
      setDirty(false);
      setServerBody(snapshot);
      setStatus("saved");
    }
  }, [pageId]);

  // Flush on unmount so navigating away mid-sentence cannot lose the tail.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (dirtyRef.current) void updatePage({ pageId, body: latest.current });
    };
  }, [pageId]);

  const onChange = (next: string) => {
    setValue(next);
    latest.current = next;
    setDirty(true);
    dirtyRef.current = true;
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), AUTOSAVE_MS);
  };

  const tabs: { id: Tab; label: string; icon: typeof Pencil }[] = [
    { id: "write", label: "Write", icon: Pencil },
    { id: "preview", label: "Preview", icon: Eye },
    ...(enhancedBody
      ? [{ id: "enhanced" as Tab, label: "Enhanced", icon: Sparkles }]
      : []),
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-border bg-card p-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                tab === id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-xs",
            status === "error" ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {status === "saving" && <Loader2 className="h-3 w-3 animate-spin" />}
          {status === "saved" && <Check className="h-3 w-3" />}
          {status === "saving"
            ? "Saving…"
            : status === "error"
              ? "Could not save — keep the tab open and try again"
              : "Saved"}
        </span>
      </div>

      {tab === "write" && (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => void save()}
          placeholder={
            "Type as the meeting goes. Fragments are fine — the AI reads them later.\n\n- who said what\n- decisions\n- what you agreed to do"
          }
          className="min-h-[420px] w-full resize-y rounded-lg border border-border bg-card p-4 font-mono text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          spellCheck
        />
      )}

      {tab === "preview" && (
        <div className="min-h-[420px] rounded-lg border border-border bg-card p-4 text-sm text-foreground">
          {value.trim() ? (
            <Markdown content={value} />
          ) : (
            <p className="text-muted-foreground">Nothing written yet.</p>
          )}
        </div>
      )}

      {tab === "enhanced" && enhancedBody && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            AI clean-up of your notes. Read-only — your own text is untouched
            under Write.
          </p>
          <div className="min-h-[420px] rounded-lg border border-border bg-card p-4 text-sm text-foreground">
            <Markdown content={enhancedBody} />
          </div>
        </div>
      )}
    </div>
  );
}
