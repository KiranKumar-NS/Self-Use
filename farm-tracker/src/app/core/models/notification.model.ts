export type NotificationType = 'loan_overdue' | 'task_overdue' | 'budget_warning' | 'budget_exceeded'
  | 'recurring_due' | 'reminder_due' | 'reminder_upcoming' | 'low_stock' | 'delivery_expected';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  severity: 'warning' | 'error';
  link: string;
  createdAt: Date;
}
