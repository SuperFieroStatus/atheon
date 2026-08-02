export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  color: string;
  timezone?: string | null;
}

export type Role = 'owner' | 'collaborate' | 'view' | null;

export interface BoardStub {
  id: string;
  name: string;
  position: number;
}

export interface ProjectNode {
  id: string;
  name: string;
  workspace_id: string;
  role: Role;
  boards: BoardStub[];
}

export interface WorkspaceNode {
  id: string;
  name: string;
  is_personal: boolean;
  role: Role;
  isOwner: boolean;
  projects: ProjectNode[];
}

export interface Category {
  id: string;
  board_id: string;
  name: string;
  color: string | null;
  position: number;
}

export interface Tag {
  id: string;
  board_id: string;
  name: string;
  color: string;
}

export interface Task {
  id: string;
  board_id: string;
  category_id: string | null;
  parent_task_id: string | null;
  name: string;
  description: string;
  due_date: string | null;
  assignee_ids: string[];
  priority: 'low' | 'medium' | 'high' | 'urgent' | null;
  dependency_id: string | null;
  completed: boolean;
  position: number;
  created_at: string;
  tags: Tag[];
}

export interface Member {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  color: string;
}

export interface BoardData {
  board: { id: string; name: string; project_id: string };
  project: { id: string; name: string };
  workspace: { id: string; name: string };
  role: Role;
  canEdit: boolean;
  categories: Category[];
  tasks: Task[];
  tags: Tag[];
  members: Member[];
}

export interface Comment {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  first_name: string;
  last_name: string;
  color: string;
}

export interface Todo {
  id: string;
  name: string;
  due_date: string | null;
  completed: boolean;
  position: number;
}

export interface Group {
  id: string;
  name: string;
  owner_id: string;
  owner?: Member;
  members: Member[];
}
