"use client";

import { useRef, useState, useTransition } from "react";
import { Download, FileUp } from "lucide-react";
import { INPUT } from "@/components/goals/GoalFormParts";
import { importRoadmap } from "@/app/(app)/goals/plan/actions";
import type { PlanDraft } from "@/lib/planning/draft";

const MAX_CHARS = 40_000;

/** Paste or upload a Markdown roadmap; the AI reads it into a draft to review. */
export function ImportPanel({ onDraft }: { onDraft: (draft: PlanDraft, warnings: string[]) => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const readFile = async (file: File) => {
    if (file.size > 200_000) return setError("That file is too large. A roadmap is usually under 40 KB.");
    setError(null);
    setText(await file.text());
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await importRoadmap(text);
      if (!result.ok) return setError(result.error);
      onDraft(result.data.draft, result.data.warnings);
    });
  };

  return (
    <div className="space-y-3">
      <p className="max-w-prose text-sm text-muted-foreground">
        Upload the plan you&apos;ve written: targets over time, checklists, year-by-year milestones. It&apos;s split
        into streams, goals, targets with a path, and weekly actions, and you review everything before it&apos;s saved.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          <FileUp className="h-4 w-4" />
          Choose a .md file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".md,.markdown,.txt,text/markdown,text/plain"
          className="sr-only"
          aria-label="Roadmap file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void readFile(file);
            e.target.value = "";
          }}
        />
        <a
          href="/templates/roadmap-template.md"
          download="roadmap-template.md"
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Download className="h-4 w-4" />
          Blank template
        </a>
      </div>
      <label htmlFor="roadmap_text" className="sr-only">
        Roadmap
      </label>
      <textarea
        id="roadmap_text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        placeholder={"# My Roadmap: 2026 to 2034\n\n## Targets Over Time\n| Metric | Now | End of 2026 | Mid-2027 |\n|---|---|---|---|\n| Weight (kg) | 95 | 89–90 | 82–85 |"}
        className={`${INPUT} h-auto py-2 font-mono text-xs`}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{text.length.toLocaleString("en-IN")} of {MAX_CHARS.toLocaleString("en-IN")} characters</span>
        <span>Sent to the AI to read; nothing is saved until you review it.</span>
      </div>
      {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending || text.trim().length < 40 || text.length > MAX_CHARS}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "Reading your plan…" : "Read my plan"}
        </button>
        {pending && <span className="text-xs text-muted-foreground">A full roadmap takes about a minute.</span>}
      </div>
    </div>
  );
}
