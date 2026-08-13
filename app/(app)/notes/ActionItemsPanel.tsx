"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ListChecks, Loader2, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { deleteTask, toggleTaskComplete } from "../todo/actions";
import type { ExtractedActionItem } from "@/lib/ai/notes";
import { addActionItems } from "./actions";
import type { PageActionItem } from "./types";

export type Proposal = ExtractedActionItem & { accepted: boolean };

/** Matches the server action's own limit, so the message beats the rejection. */
const MAX_ITEM_LENGTH = 500;

export function ActionItemsPanel({
  pageId,
  items,
  proposals,
  accepting,
  error,
  onToggleProposal,
  onAcceptProposals,
  onDiscardProposals,
  onDismissError,
}: {
  pageId: string;
  items: PageActionItem[];
  /** Null until an extraction has run; empty means the AI found nothing. */
  proposals: Proposal[] | null;
  accepting: boolean;
  error: string | null;
  onToggleProposal: (index: number) => void;
  onAcceptProposals: () => void;
  onDiscardProposals: () => void;
  onDismissError: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  // Toggling and deleting are applied locally first so the checkbox responds
  // instantly; the server list replaces this whenever the route re-renders.
  const [local, setLocal] = useState(items);
  const [serverItems, setServerItems] = useState(items);
  if (items !== serverItems) {
    setServerItems(items);
    setLocal(items);
  }

  const today = new Date().toISOString().slice(0, 10);
  const open = local.filter((item) => !item.is_completed);
  const done = local.filter((item) => item.is_completed);
  const acceptedCount =
    proposals?.filter((p) => p.accepted && p.owner === "me").length ?? 0;

  const toggle = (item: PageActionItem) => {
    const next = !item.is_completed;
    setLocal((prev) =>
      prev.map((t) => (t.id === item.id ? { ...t, is_completed: next } : t))
    );
    startTransition(async () => {
      const result = await toggleTaskComplete({
        taskId: item.id,
        isCompleted: next,
      });
      if (!result.ok) router.refresh();
    });
  };

  const remove = (item: PageActionItem) => {
    setLocal((prev) => prev.filter((t) => t.id !== item.id));
    startTransition(async () => {
      const result = await deleteTask(item.id);
      if (!result.ok) router.refresh();
    });
  };

  // The input is cleared as if the item was added, so anything the server
  // refuses has to be said out loud — silently dropping it leaves the user
  // believing a commitment is tracked when it is not.
  const add = () => {
    const title = draft.trim();
    if (!title) return;
    if (title.length > MAX_ITEM_LENGTH) {
      setAddError(
        `That is ${title.length} characters. Action items have to be ${MAX_ITEM_LENGTH} or fewer.`
      );
      return;
    }
    setAddError(null);
    setDraft("");
    startTransition(async () => {
      const result = await addActionItems({ pageId, items: [{ title }] });
      if (!result.ok) {
        setAddError(result.error);
        setDraft(title);
        return;
      }
      if (result.data.added === 0) {
        setAddError("That is already on this page's list.");
        setDraft(title);
        return;
      }
      router.refresh();
    });
  };

  const renderItem = (item: PageActionItem) => {
    const overdue =
      !item.is_completed && item.due_date !== null && item.due_date < today;

    return (
      <li
        key={item.id}
        className="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
      >
        <button
          onClick={() => toggle(item)}
          role="checkbox"
          aria-checked={item.is_completed}
          aria-label={
            item.is_completed
              ? `Mark "${item.title}" as not done`
              : `Mark "${item.title}" as done`
          }
          className={cn(
            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
            item.is_completed
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border hover:border-primary"
          )}
        >
          {item.is_completed && <Check className="h-3 w-3" />}
        </button>

        <span
          className={cn(
            "min-w-0 flex-1 text-sm",
            item.is_completed
              ? "text-muted-foreground line-through"
              : "text-foreground"
          )}
        >
          {item.title}
        </span>

        {item.due_date && (
          <span
            className={cn(
              "shrink-0 text-xs tabular-nums",
              overdue ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {item.due_date}
          </span>
        )}

        <button
          onClick={() => remove(item)}
          disabled={pending}
          className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 hover:text-destructive focus:opacity-100 group-hover:opacity-100 disabled:opacity-50"
          aria-label={`Delete "${item.title}"`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </li>
    );
  };

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ListChecks className="h-4 w-4" />
          Action items
          {open.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">
              {open.length}
            </span>
          )}
        </h2>
        <Link
          href="/todo"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Open in Todo
        </Link>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="flex-1">{error}</p>
          <button
            onClick={onDismissError}
            className="shrink-0 rounded p-0.5 hover:bg-destructive/10"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {proposals !== null && proposals.length === 0 && (
        <p className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
          No commitments found in this page.
        </p>
      )}

      {/* Proposals sit directly above the list they drop into, so accepting is
          visibly the same list gaining rows. */}
      {proposals !== null && proposals.length > 0 && (
        <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
          <p className="text-xs text-muted-foreground">
            Suggested from your notes. Nothing is saved until you accept.
          </p>

          <ul className="space-y-1">
            {proposals.map((proposal, index) => {
              const mine = proposal.owner === "me";
              return (
                <li
                  key={`${proposal.title}-${index}`}
                  className={cn(
                    "flex items-start gap-2",
                    mine ? "" : "opacity-60"
                  )}
                >
                  <button
                    onClick={() => onToggleProposal(index)}
                    disabled={!mine || accepting}
                    role="checkbox"
                    aria-checked={proposal.accepted}
                    aria-label={`Accept "${proposal.title}"`}
                    className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      proposal.accepted
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border",
                      mine ? "hover:border-primary" : "cursor-not-allowed"
                    )}
                  >
                    {proposal.accepted && <Check className="h-3 w-3" />}
                  </button>

                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-sm text-foreground">{proposal.title}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {!mine && (
                        <span>
                          {proposal.owner_name
                            ? `Assigned to ${proposal.owner_name}`
                            : "Assigned to someone else"}
                        </span>
                      )}
                      {proposal.due_date && (
                        <span className="tabular-nums">
                          Due {proposal.due_date}
                        </span>
                      )}
                      {proposal.confidence === "low" && <span>Unsure</span>}
                    </div>
                    {/* The line the item was read from — the evidence you
                        accept or reject on. */}
                    {proposal.source_quote && (
                      <p className="text-xs italic text-muted-foreground">
                        “{proposal.source_quote}”
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={onAcceptProposals}
              disabled={accepting || acceptedCount === 0}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {accepting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Add {acceptedCount}
            </button>
            <button
              onClick={onDiscardProposals}
              disabled={accepting}
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {local.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing tracked from this page yet.
        </p>
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {open.map(renderItem)}
          {done.map(renderItem)}
        </ul>
      )}

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder="Add an action item…"
          aria-label="Add an action item"
          className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          onClick={add}
          disabled={pending || draft.trim().length === 0}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>

      {addError && (
        <p role="alert" className="text-xs text-destructive">
          {addError}
        </p>
      )}
    </section>
  );
}
