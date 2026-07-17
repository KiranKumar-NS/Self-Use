import { inject, Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  writeBatch,
  serverTimestamp,
  QueryDocumentSnapshot,
  limit,
  startAfter,
  orderBy,
  Timestamp,
} from '@angular/fire/firestore';
import { Transaction, pendingRemaining } from '../models/transaction.model';
import { MonthlySummary, YearlySummary } from '../models/monthly-summary.model';
import { Buyer } from '../models/buyer.model';
import { Supplier } from '../models/supplier.model';

export interface ReconciliationReport {
  totalTransactions: number;
  monthlySummariesWritten: number;
  yearlySummariesWritten: number;
  monthlyCorrected: number;
  yearlyCorrected: number;
}

export interface CounterpartyReconciliationReport {
  totalTransactions: number;
  buyersChecked: number;
  buyersCorrected: number;
  suppliersChecked: number;
  suppliersCorrected: number;
}

interface SummaryAccumulator {
  totalExpense: number;
  totalIncome: number;
  expenseByCategory: Record<string, number>;
  incomeBySource: Record<string, number>;
  expenseByCategoryId: Record<string, number>;
  incomeBySourceId: Record<string, number>;
  expenseByPerson: Record<string, number>;
  incomeByPerson: Record<string, number>;
  pendingIncome: number;
  pendingExpense: number;
  totalDistributed: number;
  distributionByPerson: Record<string, number>;
}

@Injectable({ providedIn: 'root' })
export class SummaryReconciliationService {
  private firestore = inject(Firestore);

  /** Build a unique summary key per person (mirrors TransactionService.personSummaryKey). */
  private personSummaryKey(paidBy: string | null | undefined, paidByName: string | null | undefined, fallbackUid: string): string {
    if (paidBy === 'other' && paidByName) {
      const normalized = paidByName.trim().replace(/\s+/g, ' ')
        .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      return normalized.replace(/[.$/\[\]#]/g, '_');
    }
    return paidBy || fallbackUid;
  }

  private createEmptyAccumulator(): SummaryAccumulator {
    return {
      totalExpense: 0,
      totalIncome: 0,
      expenseByCategory: {},
      incomeBySource: {},
      expenseByCategoryId: {},
      incomeBySourceId: {},
      expenseByPerson: {},
      incomeByPerson: {},
      pendingIncome: 0,
      pendingExpense: 0,
      totalDistributed: 0,
      distributionByPerson: {},
    };
  }

  private accumulateTransaction(acc: SummaryAccumulator, txn: Transaction): void {
    const personKey = this.personSummaryKey(txn.paidBy, txn.paidByName, txn.createdBy);

    if (txn.type === 'expense') {
      acc.totalExpense += txn.amount;
      acc.expenseByCategory[txn.categoryName] = (acc.expenseByCategory[txn.categoryName] || 0) + txn.amount;
      acc.expenseByCategoryId[txn.category] = (acc.expenseByCategoryId[txn.category] || 0) + txn.amount;
      acc.expenseByPerson[personKey] = (acc.expenseByPerson[personKey] || 0) + txn.amount;

      if ((txn.expensePaymentStatus || 'paid') === 'pending') {
        acc.pendingExpense += pendingRemaining(txn);
      }
    } else {
      acc.totalIncome += txn.amount;
      acc.incomeBySource[txn.categoryName] = (acc.incomeBySource[txn.categoryName] || 0) + txn.amount;
      acc.incomeBySourceId[txn.category] = (acc.incomeBySourceId[txn.category] || 0) + txn.amount;
      acc.incomeByPerson[personKey] = (acc.incomeByPerson[personKey] || 0) + txn.amount;

      if ((txn.paymentStatus || 'received') === 'pending') {
        acc.pendingIncome += pendingRemaining(txn);
      }
    }

    // Distributions
    if (txn.distributions?.length) {
      for (const d of txn.distributions) {
        acc.totalDistributed += d.amount;
        acc.distributionByPerson[d.uid] = (acc.distributionByPerson[d.uid] || 0) + d.amount;
      }
    }
  }

  /** Fetch ALL non-deleted transactions with pagination to avoid Firestore limits. */
  private async fetchAllTransactions(): Promise<Transaction[]> {
    const PAGE_SIZE = 200;
    const txnCol = collection(this.firestore, 'transactions');
    const allTxns: Transaction[] = [];
    let lastDoc: QueryDocumentSnapshot | null = null;
    const baseConstraints = [where('isDeleted', '==', false), orderBy('createdAt')] as const;

    while (true) {
      let docs: QueryDocumentSnapshot[];

      if (lastDoc) {
        const snapshot = await getDocs(query(txnCol, ...baseConstraints, startAfter(lastDoc), limit(PAGE_SIZE)));
        docs = snapshot.docs;
      } else {
        const snapshot = await getDocs(query(txnCol, ...baseConstraints, limit(PAGE_SIZE)));
        docs = snapshot.docs;
      }

      for (const docSnap of docs) {
        allTxns.push({ id: docSnap.id, ...docSnap.data() } as Transaction);
      }

      if (docs.length < PAGE_SIZE) break;
      lastDoc = docs[docs.length - 1];
    }

    return allTxns;
  }

  /** Reconcile all monthly and yearly summaries from raw transaction data. */
  async reconcileAll(): Promise<ReconciliationReport> {
    const transactions = await this.fetchAllTransactions();

    // Group by monthly key: `{month}-{segment}`
    const monthlyMap = new Map<string, { acc: SummaryAccumulator; month: string; year: number; segment: string }>();
    // Group by yearly key: `{year}-{segment}`
    const yearlyMap = new Map<string, { acc: SummaryAccumulator; year: number; segment: string }>();

    for (const txn of transactions) {
      // Monthly
      const monthKey = `${txn.month}-${txn.segment}`;
      if (!monthlyMap.has(monthKey)) {
        monthlyMap.set(monthKey, {
          acc: this.createEmptyAccumulator(),
          month: txn.month,
          year: txn.year,
          segment: txn.segment,
        });
      }
      this.accumulateTransaction(monthlyMap.get(monthKey)!.acc, txn);

      // Yearly
      const yearKey = `${txn.year}-${txn.segment}`;
      if (!yearlyMap.has(yearKey)) {
        yearlyMap.set(yearKey, {
          acc: this.createEmptyAccumulator(),
          year: txn.year,
          segment: txn.segment,
        });
      }
      this.accumulateTransaction(yearlyMap.get(yearKey)!.acc, txn);
    }

    // Read existing summaries to count corrections
    const [existingMonthly, existingYearly] = await Promise.all([
      getDocs(collection(this.firestore, 'monthlySummaries')),
      getDocs(collection(this.firestore, 'yearlySummaries')),
    ]);

    const existingMonthlyMap = new Map<string, any>();
    existingMonthly.docs.forEach(d => existingMonthlyMap.set(d.id, d.data()));
    const existingYearlyMap = new Map<string, any>();
    existingYearly.docs.forEach(d => existingYearlyMap.set(d.id, d.data()));

    // Build all doc writes
    const monthlyDocs: { id: string; data: MonthlySummary }[] = [];
    for (const [key, { acc, month, year, segment }] of monthlyMap) {
      monthlyDocs.push({
        id: key,
        data: {
          month,
          year,
          segment,
          totalExpense: acc.totalExpense,
          totalIncome: acc.totalIncome,
          netProfit: acc.totalIncome - acc.totalExpense,
          expenseByCategory: acc.expenseByCategory,
          incomeBySource: acc.incomeBySource,
          expenseByCategoryId: acc.expenseByCategoryId,
          incomeBySourceId: acc.incomeBySourceId,
          expenseByPerson: acc.expenseByPerson,
          incomeByPerson: acc.incomeByPerson,
          pendingIncome: acc.pendingIncome,
          pendingExpense: acc.pendingExpense,
          totalDistributed: acc.totalDistributed,
          distributionByPerson: acc.distributionByPerson,
          updatedAt: serverTimestamp() as any,
        },
      });
    }

    const yearlyDocs: { id: string; data: YearlySummary }[] = [];
    for (const [key, { acc, year, segment }] of yearlyMap) {
      yearlyDocs.push({
        id: key,
        data: {
          year,
          segment,
          totalExpense: acc.totalExpense,
          totalIncome: acc.totalIncome,
          netProfit: acc.totalIncome - acc.totalExpense,
          expenseByCategory: acc.expenseByCategory,
          incomeBySource: acc.incomeBySource,
          expenseByCategoryId: acc.expenseByCategoryId,
          incomeBySourceId: acc.incomeBySourceId,
          expenseByPerson: acc.expenseByPerson,
          incomeByPerson: acc.incomeByPerson,
          pendingIncome: acc.pendingIncome,
          pendingExpense: acc.pendingExpense,
          totalDistributed: acc.totalDistributed,
          distributionByPerson: acc.distributionByPerson,
          updatedAt: serverTimestamp() as any,
        },
      });
    }

    // Also delete orphaned summary docs that no longer have transactions
    const orphanedMonthlyIds = [...existingMonthlyMap.keys()].filter(id => !monthlyMap.has(id));
    const orphanedYearlyIds = [...existingYearlyMap.keys()].filter(id => !yearlyMap.has(id));

    // Count corrections (where existing data differs from recomputed)
    let monthlyCorrected = 0;
    for (const d of monthlyDocs) {
      const existing = existingMonthlyMap.get(d.id);
      if (!existing || existing.totalExpense !== d.data.totalExpense || existing.totalIncome !== d.data.totalIncome || existing.netProfit !== d.data.netProfit) {
        monthlyCorrected++;
      }
    }
    monthlyCorrected += orphanedMonthlyIds.length;

    let yearlyCorrected = 0;
    for (const d of yearlyDocs) {
      const existing = existingYearlyMap.get(d.id);
      if (!existing || existing.totalExpense !== d.data.totalExpense || existing.totalIncome !== d.data.totalIncome || existing.netProfit !== d.data.netProfit) {
        yearlyCorrected++;
      }
    }
    yearlyCorrected += orphanedYearlyIds.length;

    // Write in batches of 500
    const allWrites: { ref: any; data: any; isDelete?: boolean }[] = [];
    for (const d of monthlyDocs) {
      allWrites.push({ ref: doc(this.firestore, 'monthlySummaries', d.id), data: d.data });
    }
    for (const d of yearlyDocs) {
      allWrites.push({ ref: doc(this.firestore, 'yearlySummaries', d.id), data: d.data });
    }
    for (const id of orphanedMonthlyIds) {
      allWrites.push({ ref: doc(this.firestore, 'monthlySummaries', id), data: null, isDelete: true });
    }
    for (const id of orphanedYearlyIds) {
      allWrites.push({ ref: doc(this.firestore, 'yearlySummaries', id), data: null, isDelete: true });
    }

    const BATCH_LIMIT = 500;
    for (let i = 0; i < allWrites.length; i += BATCH_LIMIT) {
      const batch = writeBatch(this.firestore);
      const chunk = allWrites.slice(i, i + BATCH_LIMIT);
      for (const w of chunk) {
        if (w.isDelete) {
          batch.delete(w.ref);
        } else {
          batch.set(w.ref, w.data);
        }
      }
      await batch.commit();
    }

    return {
      totalTransactions: transactions.length,
      monthlySummariesWritten: monthlyDocs.length,
      yearlySummariesWritten: yearlyDocs.length,
      monthlyCorrected,
      yearlyCorrected,
    };
  }

  /**
   * Re-derive buyer/supplier stat counters from raw transactions and rewrite
   * any that drifted. Unlike summaries, these counters were historically only
   * updated by the sale dialogs (never by form-linked transactions), so first
   * runs typically correct many records.
   */
  async reconcileCounterparties(): Promise<CounterpartyReconciliationReport> {
    const transactions = await this.fetchAllTransactions();

    interface PartyAcc {
      count: number;
      amount: number;
      pending: number;
      lastDate: number; // millis
      countBySegment: Record<string, number>;
      amountBySegment: Record<string, number>;
    }
    const emptyAcc = (): PartyAcc => ({ count: 0, amount: 0, pending: 0, lastDate: 0, countBySegment: {}, amountBySegment: {} });

    const buyerAcc = new Map<string, PartyAcc>();
    const supplierAcc = new Map<string, PartyAcc>();

    for (const txn of transactions) {
      if (txn.type === 'income' && txn.linkedBuyerId) {
        let acc = buyerAcc.get(txn.linkedBuyerId);
        if (!acc) { acc = emptyAcc(); buyerAcc.set(txn.linkedBuyerId, acc); }
        // totalPurchases counts units when a quantity was recorded (matches
        // BuyerService.updateStats semantics used by the sale dialogs)
        const units = txn.quantity || 1;
        acc.count += units;
        acc.amount += txn.amount;
        acc.lastDate = Math.max(acc.lastDate, txn.date.toMillis());
        acc.countBySegment[txn.segment] = (acc.countBySegment[txn.segment] || 0) + units;
        acc.amountBySegment[txn.segment] = (acc.amountBySegment[txn.segment] || 0) + txn.amount;
      }
      if (txn.type === 'expense' && txn.linkedSupplierId && !txn.linkedLoanId) {
        let acc = supplierAcc.get(txn.linkedSupplierId);
        if (!acc) { acc = emptyAcc(); supplierAcc.set(txn.linkedSupplierId, acc); }
        acc.count += 1; // totalOrders is a transaction count
        acc.amount += txn.amount;
        acc.pending += pendingRemaining(txn);
        acc.lastDate = Math.max(acc.lastDate, txn.date.toMillis());
        acc.countBySegment[txn.segment] = (acc.countBySegment[txn.segment] || 0) + 1;
        acc.amountBySegment[txn.segment] = (acc.amountBySegment[txn.segment] || 0) + txn.amount;
      }
    }

    const [buyerSnap, supplierSnap] = await Promise.all([
      getDocs(collection(this.firestore, 'buyers')),
      getDocs(collection(this.firestore, 'suppliers')),
    ]);

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const sameMap = (a: Record<string, number> | undefined, b: Record<string, number>) =>
      JSON.stringify(Object.entries(a || {}).sort()) === JSON.stringify(Object.entries(b).sort());

    const writes: { ref: any; data: Record<string, any> }[] = [];
    let buyersChecked = 0;
    let buyersCorrected = 0;
    for (const snap of buyerSnap.docs) {
      const buyer = snap.data() as Buyer;
      if (buyer.isDeleted) continue;
      buyersChecked++;
      const acc = buyerAcc.get(snap.id) || emptyAcc();
      const averageRate = acc.count > 0 ? round2(acc.amount / acc.count) : 0;
      const drifted =
        (buyer.totalPurchases || 0) !== acc.count ||
        (buyer.totalAmountPaid || 0) !== acc.amount ||
        (buyer.averageRate || 0) !== averageRate ||
        (buyer.lastPurchaseDate?.toMillis() || 0) !== acc.lastDate ||
        !sameMap(buyer.purchasesBySegment, acc.countBySegment) ||
        !sameMap(buyer.amountBySegment, acc.amountBySegment);
      if (!drifted) continue;
      buyersCorrected++;
      writes.push({
        ref: doc(this.firestore, 'buyers', snap.id),
        data: {
          totalPurchases: acc.count,
          totalAmountPaid: acc.amount,
          averageRate,
          lastPurchaseDate: acc.lastDate ? Timestamp.fromMillis(acc.lastDate) : null,
          purchasesBySegment: acc.countBySegment,
          amountBySegment: acc.amountBySegment,
        },
      });
    }

    let suppliersChecked = 0;
    let suppliersCorrected = 0;
    for (const snap of supplierSnap.docs) {
      const supplier = snap.data() as Supplier;
      if (supplier.isDeleted) continue;
      suppliersChecked++;
      const acc = supplierAcc.get(snap.id) || emptyAcc();
      const averageRate = acc.count > 0 ? round2(acc.amount / acc.count) : 0;
      const drifted =
        (supplier.totalOrders || 0) !== acc.count ||
        (supplier.totalAmountPaid || 0) !== acc.amount ||
        (supplier.pendingAmount || 0) !== acc.pending ||
        (supplier.averageRate || 0) !== averageRate ||
        (supplier.lastOrderDate?.toMillis() || 0) !== acc.lastDate ||
        !sameMap(supplier.ordersBySegment, acc.countBySegment) ||
        !sameMap(supplier.amountBySegment, acc.amountBySegment);
      if (!drifted) continue;
      suppliersCorrected++;
      writes.push({
        ref: doc(this.firestore, 'suppliers', snap.id),
        data: {
          totalOrders: acc.count,
          totalAmountPaid: acc.amount,
          pendingAmount: acc.pending,
          averageRate,
          lastOrderDate: acc.lastDate ? Timestamp.fromMillis(acc.lastDate) : null,
          ordersBySegment: acc.countBySegment,
          amountBySegment: acc.amountBySegment,
        },
      });
    }

    const BATCH_LIMIT = 500;
    for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
      const batch = writeBatch(this.firestore);
      for (const w of writes.slice(i, i + BATCH_LIMIT)) {
        batch.update(w.ref, w.data);
      }
      await batch.commit();
    }

    return {
      totalTransactions: transactions.length,
      buyersChecked,
      buyersCorrected,
      suppliersChecked,
      suppliersCorrected,
    };
  }
}
