import { Timestamp } from '@angular/fire/firestore';

export type GoalType = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type GoalStatus = 'not_started' | 'in_progress' | 'completed';

export interface Milestone {
  id: string;
  title: string;
  done: boolean;
}

export interface Goal {
  id: string;
  title: string;
  description: string;
  type: GoalType;
  status: GoalStatus;
  progress: number;
  dueDate: Timestamp | null;
  milestones: Milestone[];
  assignee: string | null;
  assigneeName: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
