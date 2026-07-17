import { Timestamp } from '@angular/fire/firestore';

export type TransactionType = 'expense' | 'income';
export type PaymentMethod = 'cash' | 'upi';
export type IncomePaymentStatus = 'received' | 'pending';
export type ExpensePaymentStatus = 'paid' | 'pending';

export interface TimelineEntry {
  action: 'created' | 'updated' | 'deleted' | 'distributed' | 'payment_received' | 'payment_paid' | 'partial_payment';
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

  // Payment status
  paymentStatus?: IncomePaymentStatus;           // income: received | pending
  expensePaymentStatus?: ExpensePaymentStatus;   // expense: paid | pending

  // Partial payments while status is pending (cumulative)
  amountReceived?: number;                       // income: portion already received
  amountPaid?: number;                           // expense: portion already paid

  // When the pending amount is expected to be settled (dues aging/alerts)
  expectedPaymentDate?: Timestamp;

  // Loan linkage (auto-created transactions from loan operations)
  linkedLoanId?: string;

  // Animal cost tracking (optional)
  linkedAnimalIds?: string[];
  linkedAnimalNames?: string[];
  animalCostSplit?: Record<string, number>;

  // Buyer linkage (optional, for sale income)
  linkedBuyerId?: string;
  linkedBuyerName?: string;

  // Supplier linkage (optional, for expense purchases)
  linkedSupplierId?: string;
  linkedSupplierName?: string;

  // Harvest linkage (optional; expense costs and harvest-sale income)
  linkedHarvestId?: string;
  linkedHarvestName?: string;

  // Freeform tags for ad-hoc grouping (e.g. "vaccination-drive", "eid-season")
  tags?: string[];

  // For queries
  month: string;
  year: number;
}

/**
 * Outstanding (unsettled) amount of a transaction, net of partial payments.
 * 0 for received/paid transactions. Single source of truth for dues math,
 * summary pending counters, and reconciliation.
 */
export function pendingRemaining(t: Transaction): number {
  if (t.type === 'income') {
    if ((t.paymentStatus || 'received') !== 'pending') return 0;
    return Math.max(0, t.amount - (t.amountReceived || 0));
  }
  if ((t.expensePaymentStatus || 'paid') !== 'pending') return 0;
  return Math.max(0, t.amount - (t.amountPaid || 0));
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
  expensePaymentStatus?: ExpensePaymentStatus;
  expectedPaymentDate?: Date;
  linkedAnimalIds?: string[];
  linkedAnimalNames?: string[];
  animalCostSplit?: Record<string, number>;
  linkedBuyerId?: string;
  linkedBuyerName?: string;
  linkedSupplierId?: string;
  linkedSupplierName?: string;
  linkedHarvestId?: string;
  linkedHarvestName?: string;
  tags?: string[];
  month: string;
  year: number;
}
