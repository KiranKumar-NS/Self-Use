import { Timestamp } from '@angular/fire/firestore';
import { TransactionType, PaymentMethod } from './transaction.model';
import { TaskPriority } from './task.model';

export type ScheduleType = 'recurring_transaction' | 'reminder';
export type RepeatFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
export type ReminderType = 'vaccination' | 'deworming' | 'spraying' | 'fertilizer' |
  'insurance' | 'loan_emi' | 'breeding_checkup' | 'harvest' | 'custom';

export interface TransactionTemplate {
  type: TransactionType;
  amount: number;
  category: string;
  categoryName: string;
  segment: string;
  segmentName: string;
  description: string;
  paymentMethod: PaymentMethod;
  paidBy?: string;
  paidByName?: string;
  tags?: string[];
}

export interface ReminderConfig {
  reminderType: ReminderType;
  linkedAnimalIds?: string[];
  linkedAnimalNames?: string[];
  linkedSegment?: string;
  linkedSegmentName?: string;
  autoCreateTask: boolean;
  taskPriority?: TaskPriority;
  notifyDaysBefore: number;
}

export interface Schedule {
  id: string;
  type: ScheduleType;
  title: string;
  description: string;

  // Timing
  frequency: RepeatFrequency;
  startDate: Timestamp;
  endDate?: Timestamp;
  nextDueDate: Timestamp;
  lastProcessedDate?: Timestamp;

  // Type-specific config
  transactionTemplate?: TransactionTemplate;
  reminderConfig?: ReminderConfig;

  // Status
  isActive: boolean;
  isDeleted: boolean;
  processedCount: number;

  // Audit
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp;
}
