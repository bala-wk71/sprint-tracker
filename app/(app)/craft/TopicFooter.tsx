"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { saveTopicNotes, setTopicStatus } from "./actions";
import type { ReadingStatus } from "@/lib/craft/curriculum";

/**
 * Your own words, plus the one button that moves the topic to read.
 *
 * Notes save on a debounce and on unmount rather than behind a Save button:
 * a note you have to remember to save is a note you lose.
 */
export function TopicFooter({
  slug,
  initialStatus,
  initialNotes,
}: {
  slug: string;
  initialStatus: ReadingStatus;
  initialNotes: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [notes, setNotes] = useState(initialNotes);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The latest text and the last text the server acknowledged, in refs so the
  // unmount flush cannot close over a stale value.
  const latest = useRef(initialNotes);
  const persisted = useRef(initialNotes);

  const flush = useCallback(async () => {
    const value = latest.current;
    if (value === persisted.current) return;
    setSaved("saving");
    const result = await saveTopicNotes({ slug, notes: value });
    if (result.ok) {
      persisted.current = value;
      setSaved("saved");
    } else {
      setError(result.error);
      setSaved("idle");
    }
  }, [slug]);

  useEffect(() => {
    if (notes === persisted.current) return;
    const timer = window.setTimeout(() => void flush(), 1200);
    return () => window.clearTimeout(timer);
  }, [notes, flush]);

  // Leaving the page is the most common way a note ends, so flush on the way out.
  useEffect(() => () => void flush(), [flush]);

  const markRead = () => {
    setError(null);
    const nextStatus: ReadingStatus = status === "read" ? "reading" : "read";
    setStatus(nextStatus);
    startTransition(async () => {
      await flush();
      const result = await setTopicStatus({
        slug,
        status: nextStatus === "read" ? "read" : "reading",
      });
      if (!result.ok) {
        setError(result.error);
        setStatus(status);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-foreground">
          In your own words
        </span>
        <span className="mb-2 block text-xs leading-relaxed text-muted-foreground">
          One or two lines on what this changes about how you will work. Writing it is what
          makes it stick &mdash; and it is what you will re-read in six months to see how far
          you have come.
        </span>
        <textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            latest.current = e.target.value;
            setSaved("idle");
          }}
          onBlur={() => void flush()}
          rows={4}
          maxLength={8000}
          placeholder="The bit I keep getting wrong is…"
          className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          onClick={markRead}
          disabled={pending}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
            status === "read"
              ? "border border-border bg-background text-muted-foreground hover:text-foreground"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          {status === "read" ? "Read — mark unread" : "Mark as read"}
        </button>

        <span className="text-xs text-muted-foreground" aria-live="polite">
          {error
            ? null
            : saved === "saving"
              ? "Saving…"
              : saved === "saved"
                ? "Notes saved."
                : null}
        </span>
        {error && (
          <span className="text-xs text-destructive" role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
