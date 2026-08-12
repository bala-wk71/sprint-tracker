export type NoteKind = "page" | "meeting";

/** A node in the sidebar tree — enough to render and navigate, nothing more. */
export type NotePageNode = {
  id: string;
  parent_id: string | null;
  title: string;
  kind: NoteKind;
  position: number;
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
  is_archived: boolean;
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

/** One AI proposal, before the user accepts it. */
export type ActionItemProposal = {
  title: string;
  owner: "me" | "other";
  owner_name: string | null;
  due_date: string | null;
  source_quote: string;
  confidence: "high" | "low";
};
