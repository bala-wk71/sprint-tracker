"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileText,
  FolderTree,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createPage, deletePage, reorderPages } from "./actions";
import { filterTree, moveNode } from "./tree";
import type { NotePageNode } from "./types";

export function NotesSidebar({ tree }: { tree: NotePageNode[] }) {
  const params = useParams<{ id?: string }>();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Reordering is applied locally first so the row moves under the cursor;
  // the server tree replaces this whenever the route re-renders.
  const [local, setLocal] = useState(tree);
  const [serverTree, setServerTree] = useState(tree);
  if (tree !== serverTree) {
    setServerTree(tree);
    setLocal(tree);
  }

  const activeId = params?.id ?? null;
  const searching = query.trim().length > 0;
  const visible = useMemo(() => filterTree(local, query), [local, query]);

  // Branches are open by default and the user folds the ones they don't want,
  // so a freshly created subpage is never hidden behind a closed parent.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const addPage = (parentId: string | null) => {
    startTransition(async () => {
      const result = await createPage({ parentId });
      if (!result.ok) return;
      if (parentId) {
        setCollapsed((prev) => {
          if (!prev.has(parentId)) return prev;
          const next = new Set(prev);
          next.delete(parentId);
          return next;
        });
      }
      router.push(`/notes/${result.data.id}`);
    });
  };

  const removePage = (node: NotePageNode) => {
    const message =
      node.children.length > 0
        ? `Delete "${node.title}" and every page nested inside it? This cannot be undone.`
        : `Delete "${node.title}"? This cannot be undone.`;
    if (!confirm(message)) return;

    startTransition(async () => {
      const result = await deletePage(node.id);
      if (!result.ok) return;
      if (activeId === node.id) router.push("/notes");
      else router.refresh();
    });
  };

  const reorder = (id: string, direction: -1 | 1) => {
    const result = moveNode(local, id, direction);
    if (!result) return;
    setLocal(result.nodes);
    startTransition(async () => {
      const saved = await reorderPages({ orderedIds: result.orderedIds });
      if (!saved.ok) router.refresh();
    });
  };

  const renderNode = (node: NotePageNode, depth: number) => {
    const hasChildren = node.children.length > 0;
    const isOpen = searching || !collapsed.has(node.id);
    const isActive = node.id === activeId;
    const Icon = node.kind === "meeting" ? CalendarClock : FileText;
    // Neighbours are hidden while filtering, so a move would look inert.
    const canReorder = !searching;
    const canMoveUp = canReorder && moveNode(local, node.id, -1) !== null;
    const canMoveDown = canReorder && moveNode(local, node.id, 1) !== null;

    return (
      <li key={node.id}>
        <div
          className={cn(
            "group flex items-center gap-1 rounded-md pr-1 text-sm",
            isActive
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-accent"
          )}
          style={{ paddingLeft: `${depth * 12}px` }}
        >
          {hasChildren && !searching ? (
            <button
              onClick={() => toggle(node.id)}
              className="shrink-0 rounded p-1 hover:text-foreground"
              aria-label={
                isOpen ? `Collapse ${node.title}` : `Expand ${node.title}`
              }
            >
              {isOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          ) : (
            <span className="w-[22px] shrink-0" />
          )}

          <Link
            href={`/notes/${node.id}`}
            onClick={() => setMobileOpen(false)}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2 py-1.5",
              isActive ? "font-medium" : "hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{node.title}</span>
          </Link>

          <div className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            {canReorder && (
              <>
                <button
                  onClick={() => reorder(node.id, -1)}
                  disabled={!canMoveUp || pending}
                  className="rounded p-1 hover:text-foreground disabled:opacity-30"
                  aria-label={`Move ${node.title} up`}
                  title="Move up"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => reorder(node.id, 1)}
                  disabled={!canMoveDown || pending}
                  className="rounded p-1 hover:text-foreground disabled:opacity-30"
                  aria-label={`Move ${node.title} down`}
                  title="Move down"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            <button
              onClick={() => addPage(node.id)}
              disabled={pending}
              className="rounded p-1 hover:text-foreground disabled:opacity-50"
              aria-label={`Add a page inside ${node.title}`}
              title="Add subpage"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => removePage(node)}
              disabled={pending}
              className="rounded p-1 hover:text-destructive disabled:opacity-50"
              aria-label={`Delete ${node.title}`}
              title="Delete page"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {hasChildren && isOpen && (
          <ul>{node.children.map((child) => renderNode(child, depth + 1))}</ul>
        )}
      </li>
    );
  };

  return (
    <>
      <button
        onClick={() => setMobileOpen((open) => !open)}
        className="inline-flex items-center gap-2 self-start rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground lg:hidden"
      >
        <FolderTree className="h-4 w-4" />
        {mobileOpen ? "Hide pages" : "All pages"}
      </button>

      <aside
        className={cn(
          "shrink-0 space-y-2 rounded-lg border border-border bg-card p-3 lg:sticky lg:top-6 lg:block lg:w-64",
          mobileOpen ? "block" : "hidden"
        )}
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
            }}
            placeholder="Find a page…"
            aria-label="Find a page"
            className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {searching && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {visible.length > 0 ? (
          <ul className="-mx-1">
            {visible.map((node) => renderNode(node, 0))}
          </ul>
        ) : (
          <p className="px-1 py-3 text-xs text-muted-foreground">
            {searching ? "No page matches that." : "No pages yet."}
          </p>
        )}

        <button
          onClick={() => addPage(null)}
          disabled={pending}
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          New top-level page
        </button>
      </aside>
    </>
  );
}
