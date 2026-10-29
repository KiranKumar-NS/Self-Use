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

  // Legacy sale linkage (expense-only, single sale, full amount). Still read;
  // new links are written to linkedSales.
  linkedSaleTransactionId?: string;
  linkedSaleLabel?: string;

  // Paid from sales (expense-only, paid status): money taken from one or more
  // sale income txns. Σ amounts ≤ txn amount; the remainder is the payer's own
  // share. linkedSaleIds mirrors the ids for array-contains queries.
  linkedSales?: SaleAllocation[];
  linkedSaleIds?: string[];

  // Freeform tags for ad-hoc grouping (e.g. "vaccination-drive", "eid-season")
  tags?: string[];

  // For queries
  month: string;
  year: number;
}

export interface SaleAllocation {
  saleId: string;
  label: string;
  amount: number;
}

/**
 * Every sale an expense draws on, with the amount taken from each. A legacy
 * single-sale link counts as the full expense amount.
 */
export function saleAllocations(
  t: Pick<Transaction, 'amount' | 'linkedSales' | 'linkedSaleTransactionId' | 'linkedSaleLabel'>,
): SaleAllocation[] {
  if (t.linkedSales?.length) return t.linkedSales;
  if (t.linkedSaleTransactionId) {
    return [{ saleId: t.linkedSaleTransactionId, label: t.linkedSaleLabel || 'Linked sale', amount: t.amount }];
  }
  return [];
}

/** Amount of an expense charged against one sale (0 if not linked). */
export function allocatedToSale(
  t: Pick<Transaction, 'amount' | 'linkedSales' | 'linkedSaleTransactionId' | 'linkedSaleLabel'>,
  saleId: string,
): number {
  return saleAllocations(t).filter(a => a.saleId === saleId).reduce((s, a) => s + a.amount, 0);
}

/**
 * Portion of an expense paid with sale money (new-format links only). Legacy
 * single-sale links stay fully attributed to the payer so history doesn't shift.
 */
export function fromSalesTotal(t: { linkedSales?: SaleAllocation[] | null }): number {
  return (t.linkedSales || []).reduce((s, a) => s + a.amount, 0);
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

/**
 * Cash actually moved: amount minus outstanding pending balance.
 * Full amount for settled (or legacy status-less) transactions; the paid/received
 * portion for pending ones. Counterpart of pendingRemaining() — the two always
 * sum to t.amount.
 */
export function settledPortion(t: Transaction): number {
  return t.amount - pendingRemaining(t);
}

/**
 * Settled cash the payer actually put in: settledPortion minus the part paid
 * with sale money. This is what expenseByPerson/incomeByPerson hold.
 */
export function personSettledShare(t: Transaction): number {
  return settledPortion(t) - fromSalesTotal(t);
}

/**
 * Summary bucket key for a payer in expenseByPerson/incomeByPerson.
 * Custom "other" payers are keyed by their normalized display name
 * (trimmed, whitespace-collapsed, title-cased, Firestore-field-path safe);
 * registered users by uid. Single source of truth for every service that
 * writes person-keyed summary increments, and for reconciliation.
 */
export function personSummaryKey(
  paidBy: string | null | undefined,
  paidByName: string | null | undefined,
  fallbackUid: string,
): string {
  if (paidBy === 'other' && paidByName) {
    const normalized = paidByName.trim().replace(/\s+/g, ' ')
      .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    return normalized.replace(/[.$/\[\]#]/g, '_');
  }
  return paidBy || fallbackUid;
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
  linkedSaleTransactionId?: string;
  linkedSaleLabel?: string;
  linkedSales?: SaleAllocation[];
  tags?: string[];
  month: string;
  year: number;
}
