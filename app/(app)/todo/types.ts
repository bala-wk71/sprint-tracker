export type TodoTask = {
  id: string;
  section_id: string;
  title: string;
  description: string | null;
  is_completed: boolean;
  completed_at: string | null;
  position: number;
};

export type TodoSection = {
  id: string;
  parent_id: string | null;
  name: string;
  position: number;
  is_collapsed: boolean;
  tasks: TodoTask[];
  subsections: TodoSection[];
};
