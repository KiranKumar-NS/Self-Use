export type NotificationType = 'loan_overdue' | 'task_overdue' | 'budget_warning' | 'budget_exceeded';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  severity: 'warning' | 'error';
  link: string;
  createdAt: Date;
}
