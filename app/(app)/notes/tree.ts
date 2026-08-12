import type { NotePageNode } from "./types";

type FlatPage = Omit<NotePageNode, "children">;

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
  return roots;
}

/**
 * Ancestors of `id`, outermost first, excluding the page itself. Used for the
 * breadcrumb and to give the AI the project context a page sits in.
 */
export function ancestorsOf(rows: FlatPage[], id: string): FlatPage[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const chain: FlatPage[] = [];
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
export function rootOf(rows: FlatPage[], id: string): FlatPage | null {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const self = byId.get(id);
  if (!self) return null;
  const chain = ancestorsOf(rows, id);
  return chain[0] ?? self;
}

/** `id` plus everything beneath it. A page cannot be moved into this set. */
export function descendantIds(rows: FlatPage[], id: string): Set<string> {
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
