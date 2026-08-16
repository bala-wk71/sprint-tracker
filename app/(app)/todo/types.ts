export type TodoTask = {
  id: string;
  section_id: string;
  title: string;
  description: string | null;
  is_completed: boolean;
  completed_at: string | null;
  position: number;
  due_date: string | null;
  /** Set when the task came from a note page — see app/(app)/notes. */
  source_page_id: string | null;
  source_page_title: string | null;
};

export type TodoSection = {
  id: string;
  parent_id: string | null;
  name: string;
  position: number;
  is_collapsed: boolean;
  /** Timestamp when the section was retired, or null while it is active. */
  archived_at: string | null;
  /** Set when the section was created from a note page — only these
   *  auto-archive once everything in them is done. */
  source_page_id: string | null;
  tasks: TodoTask[];
  subsections: TodoSection[];
};
