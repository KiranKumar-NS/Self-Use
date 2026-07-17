import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  getDocs,
  query,
  orderBy,
  where,
  limit,
} from '@angular/fire/firestore';
import { Transaction, pendingRemaining } from '../models/transaction.model';
import { nameKey, normalizeName } from '../utils/name.utils';

/** Outstanding dues grouped by counterparty (buyer/supplier/free-text name). */
export interface PartyDues {
  key: string;
  /** Buyer or supplier id when the transactions are linked; null for name-only groups */
  partyId: string | null;
  partyName: string;
  /** Outstanding total, net of partial payments */
  total: number;
  count: number;
  /** Age in days of the oldest pending transaction in the group */
  oldestDays: number;
  /** How many transactions are past their expected payment date */
  overdueCount: number;
  transactions: Transaction[];
}

/** Days elapsed since a pending transaction was created (billing date). */
export function dueAgeDays(t: Transaction, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - t.date.toDate().getTime()) / 86_400_000));
}

/** True when the transaction has an expected payment date in the past. */
export function isDueOverdue(t: Transaction, now = new Date()): boolean {
  return !!t.expectedPaymentDate && t.expectedPaymentDate.toDate().getTime() < now.getTime();
}

/**
 * Computes outstanding dues live from pending transactions.
 * Intentionally NOT denormalized: correct across every transaction write path
 * (form, sale dialogs, imports, edits, deletes) with no counter drift.
 */
@Injectable({ providedIn: 'root' })
export class DuesService {
  private firestore = inject(Firestore);

  /** Pending income grouped by customer — who owes us. */
  async getReceivables(): Promise<PartyDues[]> {
    const q = query(
      collection(this.firestore, 'transactions'),
      where('isDeleted', '==', false),
      where('type', '==', 'income'),
      where('paymentStatus', '==', 'pending'),
      orderBy('date', 'desc'),
      limit(1000)
    );
    const snapshot = await getDocs(q);
    const txns = snapshot.docs.map(d => d.data() as Transaction);
    return this.groupByParty(txns, 'linkedBuyerId', 'linkedBuyerName');
  }

  /** Pending (credit) expenses grouped by supplier — whom we owe. */
  async getPayables(): Promise<PartyDues[]> {
    const q = query(
      collection(this.firestore, 'transactions'),
      where('isDeleted', '==', false),
      where('type', '==', 'expense'),
      where('expensePaymentStatus', '==', 'pending'),
      orderBy('date', 'desc'),
      limit(1000)
    );
    const snapshot = await getDocs(q);
    // Loan repayments are always 'paid', but filter defensively
    const txns = snapshot.docs.map(d => d.data() as Transaction).filter(t => !t.linkedLoanId);
    return this.groupByParty(txns, 'linkedSupplierId', 'linkedSupplierName');
  }

  private groupByParty(
    txns: Transaction[],
    idField: 'linkedBuyerId' | 'linkedSupplierId',
    nameField: 'linkedBuyerName' | 'linkedSupplierName'
  ): PartyDues[] {
    const groups = new Map<string, PartyDues>();
    const now = new Date();

    for (const t of txns) {
      const remaining = pendingRemaining(t);
      if (remaining <= 0) continue; // fully covered by partial payments
      let key: string;
      let partyId: string | null = null;
      let partyName: string;

      const linkedId = t[idField];
      const linkedName = t[nameField];

      if (linkedId) {
        key = `id:${linkedId}`;
        partyId = linkedId;
        partyName = linkedName || 'Unknown';
      } else if (linkedName) {
        key = `name:${nameKey(linkedName)}`;
        partyName = normalizeName(linkedName);
      } else if (t.paidBy === 'other' && t.paidByName) {
        key = `name:${nameKey(t.paidByName)}`;
        partyName = normalizeName(t.paidByName);
      } else {
        key = `uid:${t.paidBy || t.createdBy}`;
        partyName = t.paidByName || t.createdByName || 'Unknown';
      }

      let group = groups.get(key);
      if (!group) {
        group = { key, partyId, partyName, total: 0, count: 0, oldestDays: 0, overdueCount: 0, transactions: [] };
        groups.set(key, group);
      }
      // Prefer a linked id if a later txn in the same name group carries one
      if (!group.partyId && partyId) group.partyId = partyId;
      group.total += remaining;
      group.count++;
      group.oldestDays = Math.max(group.oldestDays, dueAgeDays(t, now));
      if (isDueOverdue(t, now)) group.overdueCount++;
      group.transactions.push(t);
    }

    return [...groups.values()].sort((a, b) => b.total - a.total);
  }
}
