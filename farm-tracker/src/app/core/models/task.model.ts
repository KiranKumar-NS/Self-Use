import { Timestamp } from '@angular/fire/firestore';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'done';
export type TaskVisibility = 'shared' | 'personal';

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
  dueDate: string | null; // 'YYYY-MM-DD' format for simplicity
}

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  visibility: TaskVisibility;
  assignee: string | null;
  assigneeName: string | null;
  dueDate: Timestamp | null;
  subtasks: Subtask[];
  tags: string[];
  kanbanOrder: number;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt: Timestamp | null;
  isDeleted?: boolean;
}
