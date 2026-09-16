// Thread-title helpers, kept out of actions.ts because a "use server" module
// may only export async functions — a constant or a sync helper there is a
// build error, not just a style problem.

/** Longest a thread title can get before the rail starts truncating badly. */
export const THREAD_TITLE_MAX = 60;

/**
 * Collapse a first message into something readable in the rail. A thread needs
 * a name the moment it appears, and "New chat" three times over is worse than
 * a truncated question.
 */
export function draftTitle(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return "New chat";
  return flat.length <= THREAD_TITLE_MAX
    ? flat
    : `${flat.slice(0, THREAD_TITLE_MAX - 1).trimEnd()}…`;
}
