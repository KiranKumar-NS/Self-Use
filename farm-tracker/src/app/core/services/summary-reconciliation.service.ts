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
} from '@angular/fire/firestore';
import { Transaction } from '../models/transaction.model';
import { MonthlySummary, YearlySummary } from '../models/monthly-summary.model';

export interface ReconciliationReport {
  totalTransactions: number;
  monthlySummariesWritten: number;
  yearlySummariesWritten: number;
  monthlyCorrected: number;
  yearlyCorrected: number;
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
  salesQtyByProduct: Record<string, number>;
  salesAmtByProduct: Record<string, number>;
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
      salesQtyByProduct: {},
      salesAmtByProduct: {},
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
        acc.pendingExpense += txn.amount;
      }
    } else {
      acc.totalIncome += txn.amount;
      acc.incomeBySource[txn.categoryName] = (acc.incomeBySource[txn.categoryName] || 0) + txn.amount;
      acc.incomeBySourceId[txn.category] = (acc.incomeBySourceId[txn.category] || 0) + txn.amount;
      acc.incomeByPerson[personKey] = (acc.incomeByPerson[personKey] || 0) + txn.amount;

      if ((txn.paymentStatus || 'received') === 'pending') {
        acc.pendingIncome += txn.amount;
      }

      // Per-product sales aggregates (mirrors TransactionService.buildApplyFields)
      if (txn.product && txn.quantity) {
        acc.salesQtyByProduct[txn.product] = (acc.salesQtyByProduct[txn.product] || 0) + txn.quantity;
        acc.salesAmtByProduct[txn.product] = (acc.salesAmtByProduct[txn.product] || 0) + txn.amount;
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
          salesQtyByProduct: acc.salesQtyByProduct,
          salesAmtByProduct: acc.salesAmtByProduct,
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
          salesQtyByProduct: acc.salesQtyByProduct,
          salesAmtByProduct: acc.salesAmtByProduct,
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
}
