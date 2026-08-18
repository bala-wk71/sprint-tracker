/**
 * `page`    — a plain document. Nests freely: projects, specs, scratch notes.
 * `series`  — a recurring meeting. Holds dated occurrences and no notes of
 *             its own, mirroring a top-level todo section.
 * `meeting` — one sitting, standalone or an occurrence of a series. A leaf:
 *             nothing nests inside a single meeting.
 */
export type NoteKind = "page" | "meeting" | "series";

export const NOTE_KINDS: readonly NoteKind[] = ["page", "meeting", "series"];

/** Narrow an untyped `kind` column to the union, defaulting to a plain page. */
export function toNoteKind(value: unknown): NoteKind {
  return value === "meeting" || value === "series" ? value : "page";
}

/** A node in the sidebar tree — enough to render and navigate, nothing more. */
export type NotePageNode = {
  id: string;
  parent_id: string | null;
  title: string;
  kind: NoteKind;
  position: number;
  meeting_date: string | null;
  updated_at: string;
  children: NotePageNode[];
};

/** One page with its full contents, as loaded by the detail route. */
export type NotePageDetail = {
  id: string;
  parent_id: string | null;
  title: string;
  kind: NoteKind;
  body: string;
  enhanced_body: string | null;
  transcript: string | null;
  meeting_date: string | null;
  attendees: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

/** A todo task that came from — or was manually attached to — a page. */
export type PageActionItem = {
  id: string;
  title: string;
  is_completed: boolean;
  due_date: string | null;
  position: number;
};

/** One sitting of a series, as listed on the series page. */
export type Occurrence = {
  id: string;
  title: string;
  meeting_date: string | null;
  updated_at: string;
  openItems: number;
  totalItems: number;
};
