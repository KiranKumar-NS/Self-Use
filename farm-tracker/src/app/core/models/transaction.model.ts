import { Timestamp } from '@angular/fire/firestore';

export type TransactionType = 'expense' | 'income';
export type PaymentMethod = 'cash' | 'upi';

export interface Transaction {
  id: string;
  type: TransactionType;
  date: Timestamp;
  amount: number;
  category: string;
  categoryName: string;
  segment: string;
  segmentName: string;
  description: string;
  paymentMethod: PaymentMethod;

  // Who paid / received
  paidBy: string | null;
  paidByName: string | null;

  // Income-specific
  recordedBy: string | null;
  recordedByName: string | null;

  // Audit fields
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp;
  updatedBy: string | null;
  updatedByName: string | null;
  updatedAt: Timestamp | null;
  isDeleted: boolean;
  deletedBy: string | null;
  deletedAt: Timestamp | null;

  // For queries
  month: string;
  year: number;
}

export interface TransactionFormData {
  type: TransactionType;
  date: Date;
  amount: number;
  category: string;
  categoryName: string;
  segment: string;
  segmentName: string;
  description: string;
  paymentMethod: PaymentMethod;
  paidBy?: string;
  paidByName?: string;
  month: string;
  year: number;
}
