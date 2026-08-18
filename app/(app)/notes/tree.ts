import type { NoteKind, NotePageNode } from "./types";

type FlatPage = Omit<NotePageNode, "children">;

/** The bare shape the structural walks need, so callers can pass less. */
type Linked = { id: string; parent_id: string | null; kind: NoteKind };

/** Build the nested tree from a flat, position-ordered row list. */
export function buildTree(rows: FlatPage[]): NotePageNode[] {
  const byId = new Map<string, NotePageNode>();
  for (const row of rows) byId.set(row.id, { ...row, children: [] });

  const roots: NotePageNode[] = [];
  for (const row of rows) {
    const node = byId.get(row.id)!;
    const parent = row.parent_id ? byId.get(row.parent_id) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  // Occurrences are ordered by when the meeting happened, not by a position
  // the user has to maintain — a series that has run for a year would be
  // unusable otherwise. Everything else keeps its hand-set order.
  for (const node of byId.values()) {
    if (node.kind === "series") node.children.sort(byOccurrenceDate);
  }
  return roots;
}

/**
 * Ancestors of `id`, outermost first, excluding the page itself. Used for the
 * breadcrumb and to give the AI the project context a page sits in.
 */
export function ancestorsOf<T extends Linked>(rows: T[], id: string): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const chain: T[] = [];
  let current = byId.get(id)?.parent_id ?? null;
  // Guard against a malformed cycle rather than hanging the render.
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const parent = byId.get(current);
    if (!parent) break;
    chain.unshift(parent);
    current = parent.parent_id;
  }
  return chain;
}

/** The top-level page `id` sits under — the project a task gets filed against. */
export function rootOf<T extends Linked>(rows: T[], id: string): T | null {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const self = byId.get(id);
  if (!self) return null;
  const chain = ancestorsOf(rows, id);
  return chain[0] ?? self;
}

/** `id` plus everything beneath it. A page cannot be moved into this set. */
export function descendantIds<T extends Linked>(rows: T[], id: string): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.parent_id) continue;
    const list = childrenOf.get(row.parent_id) ?? [];
    list.push(row.id);
    childrenOf.set(row.parent_id, list);
  }

  const out = new Set<string>([id]);
  const queue = [id];
  while (queue.length > 0) {
    const next = queue.shift()!;
    for (const child of childrenOf.get(next) ?? []) {
      if (out.has(child)) continue;
      out.add(child);
      queue.push(child);
    }
  }
  return out;
}

/**
 * Narrow the tree to pages matching `query`. A match keeps its whole subtree;
 * a non-match survives only if something beneath it matched, so the path to a
 * hit stays visible.
 */
export function filterTree(
  nodes: NotePageNode[],
  query: string
): NotePageNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;

  const out: NotePageNode[] = [];
  for (const node of nodes) {
    if (node.title.toLowerCase().includes(q)) {
      out.push(node);
      continue;
    }
    const children = filterTree(node.children, query);
    if (children.length > 0) out.push({ ...node, children });
  }
  return out;
}

/** Move the item at `from` to `to`, returning a new array. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Reorder `id` one slot in `direction` among its siblings, anywhere in the
 * tree. Returns null when it is already at that end — the caller uses that to
 * disable the control rather than firing a no-op write.
 */
export function moveNode(
  nodes: NotePageNode[],
  id: string,
  direction: -1 | 1
): { nodes: NotePageNode[]; orderedIds: string[] } | null {
  const index = nodes.findIndex((n) => n.id === id);
  if (index !== -1) {
    const to = index + direction;
    if (to < 0 || to >= nodes.length) return null;
    const reordered = moveItem(nodes, index, to);
    return { nodes: reordered, orderedIds: reordered.map((n) => n.id) };
  }

  for (let i = 0; i < nodes.length; i++) {
    const result = moveNode(nodes[i].children, id, direction);
    if (!result) continue;
    const next = [...nodes];
    next[i] = { ...nodes[i], children: result.nodes };
    return { nodes: next, orderedIds: result.orderedIds };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Kind rules
//
// The tree used to accept anything under anything, which is what made a
// subpage of a meeting possible and meaningless. Three rules replace that:
//
//   page     holds anything — that is what a document tree is for
//   series   holds occurrences only, because a series *is* its sittings
//   meeting  holds nothing; one sitting has no inside
//
// Enforced in the server action as well as here. This copy exists so the UI
// can grey the option out rather than let the user pick it and read an error.
// ---------------------------------------------------------------------------

export function canNest(child: NoteKind, parent: NoteKind | null): boolean {
  if (parent === null) return true;
  if (parent === "meeting") return false;
  if (parent === "series") return child === "meeting";
  return true;
}

/** Why a nesting was refused, in the words the user would use. */
export function nestingError(child: NoteKind, parent: NoteKind): string {
  if (parent === "meeting")
    return "A meeting is a single sitting — nothing nests inside one. Turn it into a series if it happens more than once.";
  if (parent === "series")
    return "A series holds meetings. Move this to a page instead.";
  return "That page cannot be nested there.";
}

/**
 * The page an action item is filed under as a top-level todo section.
 *
 * For an occurrence that is its series: "Daily Scrum › Aug 18" on the board,
 * whatever the series happens to sit under in the notes tree. For everything
 * else it stays the outermost ancestor, which is how the board already reads.
 */
export function topicOf<T extends Linked>(rows: T[], id: string): T | null {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const self = byId.get(id);
  if (!self) return null;

  const chain = ancestorsOf(rows, id);
  for (let i = chain.length - 1; i >= 0; i--) {
    if (chain[i].kind === "series") return chain[i];
  }
  return chain[0] ?? self;
}

/** Occurrences newest sitting first; undated ones trail, newest edit first. */
export function byOccurrenceDate<
  T extends { meeting_date: string | null; updated_at: string },
>(a: T, b: T): number {
  if (a.meeting_date && b.meeting_date)
    return b.meeting_date.localeCompare(a.meeting_date);
  if (a.meeting_date) return -1;
  if (b.meeting_date) return 1;
  return b.updated_at.localeCompare(a.updated_at);
}
