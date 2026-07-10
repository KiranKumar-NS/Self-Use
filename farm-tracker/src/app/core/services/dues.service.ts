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
import { Transaction } from '../models/transaction.model';
import { nameKey, normalizeName } from '../utils/name.utils';

/** Outstanding dues grouped by counterparty (buyer/supplier/free-text name). */
export interface PartyDues {
  key: string;
  /** Buyer or supplier id when the transactions are linked; null for name-only groups */
  partyId: string | null;
  partyName: string;
  total: number;
  count: number;
  transactions: Transaction[];
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

    for (const t of txns) {
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
        group = { key, partyId, partyName, total: 0, count: 0, transactions: [] };
        groups.set(key, group);
      }
      // Prefer a linked id if a later txn in the same name group carries one
      if (!group.partyId && partyId) group.partyId = partyId;
      group.total += t.amount;
      group.count++;
      group.transactions.push(t);
    }

    return [...groups.values()].sort((a, b) => b.total - a.total);
  }
}
