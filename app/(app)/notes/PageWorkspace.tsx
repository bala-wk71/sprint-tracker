"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ActionItemsPanel, type Proposal } from "./ActionItemsPanel";
import { NoteEditor } from "./NoteEditor";
import { TranscriptPanel } from "./TranscriptPanel";
import { addActionItems } from "./actions";
import { enhanceNotes, extractActionItems } from "./ai";
import type { PageActionItem } from "./types";

/**
 * Two-column workspace: the notes take the width, and everything the notes
 * produce — proposals, action items, the transcript they were read from —
 * lives in a rail beside them. The AI state is owned here because the buttons
 * that start it sit on the editor while its results land in the rail.
 */
export function PageWorkspace({
  pageId,
  body,
  enhancedBody,
  transcript,
  items,
  subpages,
}: {
  pageId: string;
  body: string;
  enhancedBody: string | null;
  transcript: string | null;
  items: PageActionItem[];
  /** Server-rendered subpage list, passed through rather than refetched. */
  subpages: ReactNode;
}) {
  const router = useRouter();
  const [extracting, startExtracting] = useTransition();
  const [enhancing, startEnhancing] = useTransition();
  const [accepting, startAccepting] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);

  const extract = () => {
    setError(null);
    startExtracting(async () => {
      const result = await extractActionItems(pageId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Someone else's commitment is worth seeing but is not your task, so it
      // starts unchecked and cannot be accepted.
      setProposals(
        result.data.items.map((item) => ({
          ...item,
          accepted: item.owner === "me",
        }))
      );
    });
  };

  const enhance = () => {
    setError(null);
    startEnhancing(async () => {
      const result = await enhanceNotes(pageId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const accept = () => {
    if (!proposals) return;
    const chosen = proposals.filter((p) => p.accepted && p.owner === "me");
    if (chosen.length === 0) return;

    startAccepting(async () => {
      const result = await addActionItems({
        pageId,
        items: chosen.map((p) => ({
          title: p.title,
          dueDate: p.due_date ?? null,
        })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setProposals(null);
      router.refresh();
    });
  };

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-4">
        <NoteEditor
          pageId={pageId}
          body={body}
          enhancedBody={enhancedBody}
          onExtract={extract}
          onEnhance={enhance}
          extracting={extracting}
          enhancing={enhancing}
        />
        {subpages}
      </div>

      <aside className="space-y-4 xl:sticky xl:top-6">
        <ActionItemsPanel
          pageId={pageId}
          items={items}
          proposals={proposals}
          accepting={accepting}
          error={error}
          onToggleProposal={(index) =>
            setProposals((prev) =>
              (prev ?? []).map((p, i) =>
                i === index ? { ...p, accepted: !p.accepted } : p
              )
            )
          }
          onAcceptProposals={accept}
          onDiscardProposals={() => setProposals(null)}
          onDismissError={() => setError(null)}
        />

        <TranscriptPanel pageId={pageId} transcript={transcript} />
      </aside>
    </div>
  );
}
