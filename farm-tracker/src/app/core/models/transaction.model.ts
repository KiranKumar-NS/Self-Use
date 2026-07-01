import { Timestamp } from '@angular/fire/firestore';

export type TransactionType = 'expense' | 'income';
export type PaymentMethod = 'cash' | 'upi';
export type IncomePaymentStatus = 'received' | 'pending';

export interface TimelineEntry {
  action: 'created' | 'updated' | 'deleted' | 'distributed' | 'payment_received';
  by: string;
  byName: string;
  at: Timestamp;
  changes?: string; // e.g. "amount: 5000→4500, category: Feed→Medicine"
}

export type SaleUnit = 'kg' | 'head' | 'dozen' | 'litre' | 'pieces' | 'bag' | 'bundle';

export interface Transaction {
  id: string;
  type: TransactionType;
  date: Timestamp;
  amount: number;
  quantity?: number;
  unit?: SaleUnit;
  ratePerUnit?: number;
  category: string;
  categoryName: string;
  segment: string;
  segmentName: string;
  description: string;
  paymentMethod: PaymentMethod;

  // Who paid / received
  paidBy: string | null;
  paidByName: string | null;

  // Audit
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp;
  isDeleted: boolean;

  // Status Timeline (replaces separate auditLogs collection)
  timeline: TimelineEntry[];

  // Income distribution (only for type === 'income')
  distributions?: DistributionEntry[];

  // Payment status (only for type === 'income')
  paymentStatus?: IncomePaymentStatus;

  // For queries
  month: string;
  year: number;
}

export interface DistributionEntry {
  uid: string;        // user UID or 'reinvestment'
  name: string;       // display name or 'Reinvestment'
  amount: number;
}

export interface TransactionFormData {
  type: TransactionType;
  date: Date;
  amount: number;
  quantity?: number;
  unit?: SaleUnit;
  ratePerUnit?: number;
  category: string;
  categoryName: string;
  segment: string;
  segmentName: string;
  description: string;
  paymentMethod: PaymentMethod;
  paidBy?: string;
  paidByName?: string;
  paymentStatus?: IncomePaymentStatus;
  month: string;
  year: number;
}
