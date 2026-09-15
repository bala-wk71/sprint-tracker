"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, RefreshCw, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  JOURNAL_MOODS,
  JOURNAL_PROMPTS,
  type JournalMood,
} from "@/lib/journal/constants";
import {
  deleteJournalEntry,
  saveJournalEntry,
} from "@/app/(app)/journal/actions";

export type ComposerEntry = {
  id: string;
  title: string;
  body: string;
  mood: JournalMood | null;
  entryDate: string;
  isPrivate: boolean;
  hideFromCoach: boolean;
};

type Props = {
  todayIso: string;
  /** Present when editing an existing entry. */
  entry?: ComposerEntry;
  /** Tighter layout for the quick-log sheet: no title field. */
  compact?: boolean;
};

export function JournalComposer({ todayIso, entry, compact = false }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(entry?.title ?? "");
  const [body, setBody] = useState(entry?.body ?? "");
  const [mood, setMood] = useState<JournalMood | null>(entry?.mood ?? null);
  const [isPrivate, setIsPrivate] = useState(entry?.isPrivate ?? true);
  const [hideFromCoach, setHideFromCoach] = useState(entry?.hideFromCoach ?? false);
  // Seeded from the date so server and client render the same question.
  const [promptIndex, setPromptIndex] = useState(
    () => Number(todayIso.replaceAll("-", "")) % JOURNAL_PROMPTS.length
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const idBase = entry ? `journal_${entry.id}` : compact ? "journal_quick" : "journal_new";

  const save = () => {
    if (!body.trim()) {
      setError("Write something first.");
      return;
    }
    setError(null);
    setStatus(null);
    startTransition(async () => {
      const result = await saveJournalEntry({
        id: entry?.id,
        title: compact ? "" : title,
        body,
        mood,
        entryDate: entry?.entryDate ?? todayIso,
        isPrivate,
        hideFromCoach,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (entry) {
        setStatus("Changes saved");
      } else {
        setTitle("");
        setBody("");
        setMood(null);
        setStatus(result.xp ? `Saved to your journal · +${result.xp} XP` : "Saved to your journal");
      }
      router.refresh();
    });
  };

  const remove = () => {
    if (!entry || !window.confirm("Delete this entry? This can't be undone.")) return;
    startTransition(async () => {
      const result = await deleteJournalEntry(entry.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/journal");
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {!compact && (
        <>
          <label htmlFor={`${idBase}_title`} className="sr-only">
            Title
          </label>
          <input
            id={`${idBase}_title`}
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-base font-medium text-foreground placeholder:font-normal placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary sm:text-sm"
          />
        </>
      )}

      <div>
        <label htmlFor={`${idBase}_body`} className="sr-only">
          Entry
        </label>
        <textarea
          id={`${idBase}_body`}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setStatus(null);
          }}
          rows={entry ? 12 : 5}
          placeholder={JOURNAL_PROMPTS[promptIndex]}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-base leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary sm:text-sm"
        />
        {!body && (
          <button
            type="button"
            onClick={() => setPromptIndex((i) => (i + 1) % JOURNAL_PROMPTS.length)}
            className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-3 w-3" />
            Another question
          </button>
        )}
      </div>

      <div role="radiogroup" aria-label="Mood" className="flex flex-wrap gap-1.5">
        {JOURNAL_MOODS.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={mood === m.value}
            onClick={() => setMood(mood === m.value ? null : m.value)}
            className={cn(
              "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
              mood === m.value
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <span aria-hidden>{m.emoji}</span>
            {m.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <div
          role="radiogroup"
          aria-label="Who can see this"
          className="flex items-center gap-0.5 rounded-lg border border-border bg-background p-0.5"
        >
          <PrivacyOption active={isPrivate} onClick={() => setIsPrivate(true)} icon={Lock} label="Only me" />
          <PrivacyOption
            active={!isPrivate}
            onClick={() => setIsPrivate(false)}
            icon={Users}
            label="Me and my reviewers"
          />
        </div>
        <label htmlFor={`${idBase}_coach`} className="flex items-center gap-1.5 text-muted-foreground">
          <input
            id={`${idBase}_coach`}
            type="checkbox"
            checked={hideFromCoach}
            onChange={(e) => setHideFromCoach(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-input"
          />
          Keep from the coach
        </label>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "Saving…" : entry ? "Save changes" : "Save entry"}
        </button>
        {status && (
          <span role="status" className="text-xs font-medium text-primary">
            {status}
          </span>
        )}
        {entry && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="ml-auto text-xs font-medium text-destructive hover:underline disabled:opacity-50"
          >
            Delete entry
          </button>
        )}
      </div>
    </div>
  );
}

function PrivacyOption({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-md px-2 py-1 font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}
