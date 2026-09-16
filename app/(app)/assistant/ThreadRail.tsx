"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PersonaSelector } from "./PersonaSelector";
import { createThread, deleteThread, renameThread } from "./actions";
import { THREAD_TITLE_MAX } from "./threadTitle";
import type { AiPersona } from "@/lib/ai/prompts";

export type Thread = {
  id: string;
  title: string;
  last_message_at: string;
};

/** "3m", "4h", "2d", then a date. Compact enough for a 15rem rail. */
function shortAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function ThreadRail({
  threads,
  activeId,
  persona,
}: {
  threads: Thread[];
  activeId: string | null;
  persona: AiPersona;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);

  const handleNew = () => {
    startTransition(async () => {
      const res = await createThread();
      if (res.ok) {
        setOpen(false);
        router.push(`/assistant?c=${res.id}`);
      }
    });
  };

  const handleRename = (id: string) => {
    const title = draft.trim();
    setEditing(null);
    if (!title) return;
    startTransition(async () => {
      await renameThread({ id, title: title.slice(0, THREAD_TITLE_MAX) });
      router.refresh();
    });
  };

  const handleDelete = (id: string) => {
    setMenuFor(null);
    startTransition(async () => {
      await deleteThread(id);
      // Deleting the open thread leaves nothing selected; the page picks the
      // next most recent, so drop the id from the URL rather than 404 on it.
      if (id === activeId) router.push("/assistant");
      else router.refresh();
    });
  };

  const rail = (
    <div className="flex h-full w-60 shrink-0 flex-col rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border p-3">
        <button
          onClick={handleNew}
          disabled={pending}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          New chat
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded-md p-2 text-muted-foreground hover:text-foreground md:hidden"
          aria-label="Close chat list"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {threads.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            No chats yet. Start one and it will show up here.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {threads.map((t) => {
              const isActive = t.id === activeId;
              return (
                <li key={t.id} className="group relative">
                  {editing === t.id ? (
                    <div className="flex items-center gap-1 px-1 py-1">
                      <input
                        autoFocus
                        value={draft}
                        maxLength={THREAD_TITLE_MAX}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(t.id);
                          if (e.key === "Escape") setEditing(null);
                        }}
                        className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none"
                      />
                      <button
                        onClick={() => handleRename(t.id)}
                        className="rounded p-1 text-muted-foreground hover:text-foreground"
                        aria-label="Save title"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setOpen(false);
                          router.push(`/assistant?c=${t.id}`);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-2 py-2 pr-8 text-left text-sm transition-colors",
                          isActive
                            ? "bg-primary/10 text-foreground"
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        )}
                      >
                        <MessageSquare
                          className={cn(
                            "h-3.5 w-3.5 shrink-0",
                            isActive ? "text-primary" : "text-muted-foreground"
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate">{t.title}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground/70">
                          {shortAgo(t.last_message_at)}
                        </span>
                      </button>

                      <button
                        onClick={() =>
                          setMenuFor(menuFor === t.id ? null : t.id)
                        }
                        className={cn(
                          "absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus:opacity-100 group-hover:opacity-100",
                          menuFor === t.id && "opacity-100"
                        )}
                        aria-label={`Options for ${t.title}`}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>

                      {menuFor === t.id && (
                        <div className="absolute right-1 top-full z-20 mt-0.5 w-32 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
                          <button
                            onClick={() => {
                              setDraft(t.title);
                              setEditing(t.id);
                              setMenuFor(null);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                          >
                            <Pencil className="h-3 w-3" />
                            Rename
                          </button>
                          <button
                            onClick={() => handleDelete(t.id)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-3 w-3" />
                            Delete
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-border p-3">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Coaching style
        </p>
        <PersonaSelector current={persona} />
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile: the rail is a drawer, so the chat keeps the full width. */}
      <button
        onClick={() => setOpen(true)}
        className="absolute left-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground md:hidden"
      >
        <MessageSquare className="h-3.5 w-3.5" />
        Chats
      </button>

      {open && (
        <button
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close chat list"
        />
      )}

      <div
        className={cn(
          "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:p-3 max-md:transition-transform",
          open ? "max-md:translate-x-0" : "max-md:-translate-x-full",
          "max-md:h-full"
        )}
      >
        {rail}
      </div>
    </>
  );
}
