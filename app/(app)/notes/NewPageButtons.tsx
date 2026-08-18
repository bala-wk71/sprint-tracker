"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, FilePlus2, Repeat } from "lucide-react";
import { createPage } from "./actions";
import type { NoteKind } from "./types";

const LABELS: Record<NoteKind, { label: string; icon: typeof CalendarClock }> = {
  meeting: { label: "New meeting", icon: CalendarClock },
  series: { label: "New series", icon: Repeat },
  page: { label: "New page", icon: FilePlus2 },
};

/**
 * What can be created here depends on what "here" is, because the tree has
 * rules now: a series holds sittings, a meeting holds nothing. Offering a
 * button that the server would only reject is worse than not offering it.
 */
export function NewPageButtons({
  parentId = null,
  parentKind = null,
  kinds,
}: {
  parentId?: string | null;
  parentKind?: NoteKind | null;
  /** Override the offer; defaults to whatever the parent accepts. */
  kinds?: NoteKind[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const offered: NoteKind[] =
    kinds ??
    (parentKind === "meeting"
      ? []
      : parentKind === "series"
        ? ["meeting"]
        : ["meeting", "series", "page"]);

  if (offered.length === 0) return null;

  const create = (kind: NoteKind) => {
    startTransition(async () => {
      const result = await createPage({ parentId, kind });
      if (!result.ok) return;
      router.push(`/notes/${result.data.id}`);
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      {offered.map((kind, index) => {
        const { label, icon: Icon } = LABELS[kind];
        const primary = index === 0;
        return (
          <button
            key={kind}
            onClick={() => create(kind)}
            disabled={pending}
            className={
              primary
                ? "inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                : "inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
            }
          >
            <Icon className="h-4 w-4" />
            {parentKind === "series" && kind === "meeting"
              ? "Add occurrence"
              : label}
          </button>
        );
      })}
    </div>
  );
}
