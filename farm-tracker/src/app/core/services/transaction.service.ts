import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  orderBy,
  where,
  limit,
  startAfter,
  writeBatch,
  serverTimestamp,
  increment,
  Timestamp,
  DocumentSnapshot,
  arrayUnion,
} from '@angular/fire/firestore';
import { Transaction, TransactionFormData, DistributionEntry, IncomePaymentStatus } from '../models/transaction.model';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class TransactionService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);

  /** Build a unique summary key per person. Custom "other" names get sanitized as the key. */
  private personSummaryKey(paidBy: string | null | undefined, paidByName: string | null | undefined, fallbackUid: string): string {
    if (paidBy === 'other' && paidByName) {
      return paidByName.replace(/[.$/\[\]#]/g, '_');
    }
    return paidBy || fallbackUid;
  }

  async create(data: TransactionFormData): Promise<string> {
    const batch = writeBatch(this.firestore);
    const user = this.authService.userProfile()!;

    const txnRef = doc(collection(this.firestore, 'transactions'));
    const summaryId = `${data.month}-${data.segment}`;
    const summaryRef = doc(this.firestore, 'monthlySummaries', summaryId);

    const timelineEntry: any = {
      action: 'created',
      by: user.uid,
      byName: user.displayName,
      at: Timestamp.now(),
    };

    const txnDoc: Record<string, any> = {
      id: txnRef.id,
      type: data.type,
      date: Timestamp.fromDate(data.date),
      amount: data.amount,
      category: data.category,
      categoryName: data.categoryName,
      segment: data.segment,
      segmentName: data.segmentName,
      description: data.description,
      paymentMethod: data.paymentMethod || 'upi',
      paidBy: data.paidBy || user.uid,
      paidByName: data.paidByName || user.displayName,
      createdBy: user.uid,
      createdByName: user.displayName,
      createdAt: serverTimestamp(),
      isDeleted: false,
      timeline: [timelineEntry],
      month: data.month,
      year: data.year,
    };

    if (data.type === 'income') {
      txnDoc['paymentStatus'] = data.paymentStatus || 'received';
    }

    batch.set(txnRef, txnDoc);

    // Update monthly summary
    const incField = data.type === 'expense' ? 'totalExpense' : 'totalIncome';
    const profitDelta = data.type === 'income' ? data.amount : -data.amount;
    const catField = data.type === 'expense'
      ? `expenseByCategory.${data.category}`
      : `incomeBySource.${data.category}`;

    const summaryData: Record<string, any> = {
      [incField]: increment(data.amount),
      netProfit: increment(profitDelta),
      [catField]: increment(data.amount),
      month: data.month,
      year: data.year,
      segment: data.segment,
      updatedAt: serverTimestamp(),
    };

    // Track per-person
    const personKey = this.personSummaryKey(data.paidBy, data.paidByName, user.uid);
    const personField = data.type === 'expense'
      ? `expenseByPerson.${personKey}`
      : `incomeByPerson.${personKey}`;
    summaryData[personField] = increment(data.amount);

    if (data.type === 'income' && (data.paymentStatus || 'received') === 'pending') {
      summaryData['pendingIncome'] = increment(data.amount);
    }

    batch.set(summaryRef, summaryData, { merge: true });

    await batch.commit();
    return txnRef.id;
  }

  async update(id: string, data: TransactionFormData): Promise<void> {
    const batch = writeBatch(this.firestore);
    const user = this.authService.userProfile()!;
    const txnRef = doc(this.firestore, 'transactions', id);

    const oldDoc = await getDoc(txnRef);
    const oldData = oldDoc.data() as Transaction;

    // Build changes description
    const changesList: string[] = [];
    if (oldData.amount !== data.amount) changesList.push(`amount: ${oldData.amount}→${data.amount}`);
    if (oldData.category !== data.category) changesList.push(`category: ${oldData.categoryName}→${data.categoryName}`);
    if (oldData.segment !== data.segment) changesList.push(`segment: ${oldData.segmentName}→${data.segmentName}`);
    if (oldData.type !== data.type) changesList.push(`type: ${oldData.type}→${data.type}`);
    const oldPayStatus = oldData.paymentStatus || 'received';
    const newPayStatus = data.type === 'income' ? (data.paymentStatus || 'received') : 'received';
    if (oldData.type === 'income' && data.type === 'income' && oldPayStatus !== newPayStatus) {
      changesList.push(`payment: ${oldPayStatus}→${newPayStatus}`);
    }
    const changesStr = changesList.length > 0 ? changesList.join(', ') : 'details updated';

    // Reverse old summary
    const oldSummaryId = `${oldData.month}-${oldData.segment}`;
    const oldSummaryRef = doc(this.firestore, 'monthlySummaries', oldSummaryId);
    const oldIncField = oldData.type === 'expense' ? 'totalExpense' : 'totalIncome';
    const oldProfitDelta = oldData.type === 'income' ? -oldData.amount : oldData.amount;
    const oldCatField = oldData.type === 'expense'
      ? `expenseByCategory.${oldData.category}`
      : `incomeBySource.${oldData.category}`;

    const oldSummaryUpdates: Record<string, any> = {
      [oldIncField]: increment(-oldData.amount),
      netProfit: increment(oldProfitDelta),
      [oldCatField]: increment(-oldData.amount),
      updatedAt: serverTimestamp(),
    };

    // Reverse old per-person
    const oldPersonKey = this.personSummaryKey(oldData.paidBy, oldData.paidByName, oldData.createdBy);
    const oldPersonField = oldData.type === 'expense'
      ? `expenseByPerson.${oldPersonKey}`
      : `incomeByPerson.${oldPersonKey}`;
    oldSummaryUpdates[oldPersonField] = increment(-oldData.amount);

    // Reverse old pending income
    if (oldData.type === 'income' && oldPayStatus === 'pending') {
      oldSummaryUpdates['pendingIncome'] = increment(-oldData.amount);
    }

    // Reverse old distribution totals if amount/segment/type changed
    const shouldClearDistributions = oldData.distributions?.length &&
      (oldData.amount !== data.amount || oldData.segment !== data.segment || oldData.type !== data.type);
    if (shouldClearDistributions) {
      const oldTotalDist = oldData.distributions!.reduce((s, d) => s + d.amount, 0);
      oldSummaryUpdates['totalDistributed'] = increment(-oldTotalDist);
      for (const d of oldData.distributions!) {
        oldSummaryUpdates[`distributionByPerson.${d.uid}`] = increment(-d.amount);
      }
    }

    // Apply new summary
    const newSummaryId = `${data.month}-${data.segment}`;
    const newIncField = data.type === 'expense' ? 'totalExpense' : 'totalIncome';
    const newProfitDelta = data.type === 'income' ? data.amount : -data.amount;
    const newCatField = data.type === 'expense'
      ? `expenseByCategory.${data.category}`
      : `incomeBySource.${data.category}`;
    const newPersonKey = this.personSummaryKey(data.paidBy, data.paidByName, user.uid);
    const newPersonField = data.type === 'expense'
      ? `expenseByPerson.${newPersonKey}`
      : `incomeByPerson.${newPersonKey}`;

    if (oldSummaryId === newSummaryId) {
      // Same summary doc — combine old reversal + new application into single batch.set()
      // Two batch.set() on the same doc would cause the second to overwrite the first
      const combinedSummary: Record<string, any> = { updatedAt: serverTimestamp(), month: data.month, year: data.year, segment: data.segment };

      // Total fields: reverse old + apply new
      if (oldIncField === newIncField) {
        combinedSummary[oldIncField] = increment(data.amount - oldData.amount);
      } else {
        combinedSummary[oldIncField] = increment(-oldData.amount);
        combinedSummary[newIncField] = increment(data.amount);
      }
      combinedSummary['netProfit'] = increment(oldProfitDelta + newProfitDelta);

      // Category fields: reverse old + apply new
      if (oldCatField === newCatField) {
        combinedSummary[oldCatField] = increment(data.amount - oldData.amount);
      } else {
        combinedSummary[oldCatField] = increment(-oldData.amount);
        combinedSummary[newCatField] = increment(data.amount);
      }

      // Person fields: reverse old + apply new
      if (oldPersonField === newPersonField) {
        combinedSummary[oldPersonField] = increment(data.amount - oldData.amount);
      } else {
        combinedSummary[oldPersonField] = increment(-oldData.amount);
        combinedSummary[newPersonField] = increment(data.amount);
      }

      // Distribution reversal (if applicable)
      if (shouldClearDistributions) {
        const oldTotalDist = oldData.distributions!.reduce((s, d) => s + d.amount, 0);
        combinedSummary['totalDistributed'] = increment(-oldTotalDist);
        for (const d of oldData.distributions!) {
          combinedSummary[`distributionByPerson.${d.uid}`] = increment(-d.amount);
        }
      }

      // Pending income: reverse old + apply new
      const oldPending = oldData.type === 'income' && oldPayStatus === 'pending' ? oldData.amount : 0;
      const newPending = data.type === 'income' && newPayStatus === 'pending' ? data.amount : 0;
      if (oldPending !== 0 || newPending !== 0) {
        combinedSummary['pendingIncome'] = increment(newPending - oldPending);
      }

      batch.set(oldSummaryRef, combinedSummary, { merge: true });
    } else {
      // Different summary docs — safe to do two separate sets
      batch.set(oldSummaryRef, oldSummaryUpdates, { merge: true });

      const newSummaryRef = doc(this.firestore, 'monthlySummaries', newSummaryId);
      const newSummaryData: Record<string, any> = {
        [newIncField]: increment(data.amount),
        netProfit: increment(newProfitDelta),
        [newCatField]: increment(data.amount),
        [newPersonField]: increment(data.amount),
        month: data.month,
        year: data.year,
        segment: data.segment,
        updatedAt: serverTimestamp(),
      };
      if (data.type === 'income' && newPayStatus === 'pending') {
        newSummaryData['pendingIncome'] = increment(data.amount);
      }
      batch.set(newSummaryRef, newSummaryData, { merge: true });
    }

    // Update transaction + add timeline entry
    const txnUpdates: Record<string, any> = {
      type: data.type,
      date: Timestamp.fromDate(data.date),
      amount: data.amount,
      category: data.category,
      categoryName: data.categoryName,
      segment: data.segment,
      segmentName: data.segmentName,
      description: data.description,
      paymentMethod: data.paymentMethod || 'upi',
      paidBy: data.paidBy || user.uid,
      paidByName: data.paidByName || user.displayName,
      paymentStatus: data.type === 'income' ? (data.paymentStatus || 'received') : null,
      month: data.month,
      year: data.year,
      timeline: arrayUnion({
        action: 'updated',
        by: user.uid,
        byName: user.displayName,
        at: Timestamp.now(),
        changes: changesStr,
      }),
    };

    // Clear distributions if amount, segment, or type changed (no longer valid)
    if (shouldClearDistributions) {
      txnUpdates['distributions'] = [];
    }

    batch.update(txnRef, txnUpdates);

    await batch.commit();
  }

  async softDelete(id: string): Promise<void> {
    const batch = writeBatch(this.firestore);
    const user = this.authService.userProfile()!;
    const txnRef = doc(this.firestore, 'transactions', id);

    const oldDoc = await getDoc(txnRef);
    const oldData = oldDoc.data() as Transaction;

    // Reverse summary
    const summaryId = `${oldData.month}-${oldData.segment}`;
    const summaryRef = doc(this.firestore, 'monthlySummaries', summaryId);
    const incField = oldData.type === 'expense' ? 'totalExpense' : 'totalIncome';
    const profitDelta = oldData.type === 'income' ? -oldData.amount : oldData.amount;
    const catField = oldData.type === 'expense'
      ? `expenseByCategory.${oldData.category}`
      : `incomeBySource.${oldData.category}`;

    const summaryUpdates: Record<string, any> = {
      [incField]: increment(-oldData.amount),
      netProfit: increment(profitDelta),
      [catField]: increment(-oldData.amount),
      updatedAt: serverTimestamp(),
    };

    // Reverse per-person
    const delPersonKey = this.personSummaryKey(oldData.paidBy, oldData.paidByName, oldData.createdBy);
    const delPersonField = oldData.type === 'expense'
      ? `expenseByPerson.${delPersonKey}`
      : `incomeByPerson.${delPersonKey}`;
    summaryUpdates[delPersonField] = increment(-oldData.amount);

    // Reverse pending income if applicable
    if (oldData.type === 'income' && oldData.paymentStatus === 'pending') {
      summaryUpdates['pendingIncome'] = increment(-oldData.amount);
    }

    // Reverse distribution totals if any
    if (oldData.distributions?.length) {
      const oldTotalDist = oldData.distributions.reduce((s, d) => s + d.amount, 0);
      summaryUpdates['totalDistributed'] = increment(-oldTotalDist);
      for (const d of oldData.distributions) {
        summaryUpdates[`distributionByPerson.${d.uid}`] = increment(-d.amount);
      }
    }

    batch.set(summaryRef, summaryUpdates, { merge: true });

    batch.update(txnRef, {
      isDeleted: true,
      timeline: arrayUnion({
        action: 'deleted',
        by: user.uid,
        byName: user.displayName,
        at: Timestamp.now(),
      }),
    });

    await batch.commit();
  }

  async updateDistribution(transactionId: string, distributions: DistributionEntry[]): Promise<void> {
    const batch = writeBatch(this.firestore);
    const user = this.authService.userProfile()!;
    const txnRef = doc(this.firestore, 'transactions', transactionId);

    const oldDoc = await getDoc(txnRef);
    const oldData = oldDoc.data() as Transaction;

    if (oldData.isDeleted) throw new Error('Cannot distribute a deleted transaction');
    if (oldData.type !== 'income') throw new Error('Can only distribute income');

    const totalDist = distributions.reduce((s, d) => s + d.amount, 0);
    if (totalDist > oldData.amount) throw new Error('Distribution exceeds income amount');

    // Filter out zero-amount entries
    const nonZero = distributions.filter(d => d.amount > 0);

    // Build changes description
    const oldDist = oldData.distributions || [];
    const changesList: string[] = [];
    for (const d of nonZero) {
      const old = oldDist.find(o => o.uid === d.uid);
      const oldAmt = old?.amount || 0;
      if (oldAmt !== d.amount) changesList.push(`${d.name}: ${oldAmt}→${d.amount}`);
    }
    // Check for removed entries
    for (const old of oldDist) {
      if (!nonZero.find(d => d.uid === old.uid)) {
        changesList.push(`${old.name}: ${old.amount}→0`);
      }
    }

    // Update transaction
    batch.update(txnRef, {
      distributions: nonZero,
      timeline: arrayUnion({
        action: 'distributed' as const,
        by: user.uid,
        byName: user.displayName,
        at: Timestamp.now(),
        changes: changesList.join(', ') || 'distribution updated',
      }),
    });

    // Update monthly summary distribution totals
    const summaryId = `${oldData.month}-${oldData.segment}`;
    const summaryRef = doc(this.firestore, 'monthlySummaries', summaryId);

    const summaryUpdates: Record<string, any> = {
      updatedAt: serverTimestamp(),
    };

    // Reverse old distributions
    const oldTotalDist = oldDist.reduce((s, d) => s + d.amount, 0);
    for (const d of oldDist) {
      summaryUpdates[`distributionByPerson.${d.uid}`] = increment(-d.amount);
    }

    // Apply new distributions
    const newTotalDist = nonZero.reduce((s, d) => s + d.amount, 0);
    for (const d of nonZero) {
      const existing = summaryUpdates[`distributionByPerson.${d.uid}`];
      if (existing) {
        // Already has a reverse increment, add net
        summaryUpdates[`distributionByPerson.${d.uid}`] = increment(d.amount - (oldDist.find(o => o.uid === d.uid)?.amount || 0));
      } else {
        summaryUpdates[`distributionByPerson.${d.uid}`] = increment(d.amount);
      }
    }

    summaryUpdates['totalDistributed'] = increment(newTotalDist - oldTotalDist);

    batch.set(summaryRef, summaryUpdates, { merge: true });

    await batch.commit();
  }

  async markAsReceived(transactionId: string): Promise<void> {
    const batch = writeBatch(this.firestore);
    const user = this.authService.userProfile()!;
    const txnRef = doc(this.firestore, 'transactions', transactionId);

    const oldDoc = await getDoc(txnRef);
    const oldData = oldDoc.data() as Transaction;

    if (oldData.isDeleted) throw new Error('Cannot update a deleted transaction');
    if (oldData.type !== 'income') throw new Error('Only income transactions have payment status');
    if (oldData.paymentStatus !== 'pending') throw new Error('Transaction is already received');

    batch.update(txnRef, {
      paymentStatus: 'received' as IncomePaymentStatus,
      timeline: arrayUnion({
        action: 'payment_received',
        by: user.uid,
        byName: user.displayName,
        at: Timestamp.now(),
      }),
    });

    // Decrement pendingIncome in monthly summary
    const summaryId = `${oldData.month}-${oldData.segment}`;
    const summaryRef = doc(this.firestore, 'monthlySummaries', summaryId);
    batch.set(summaryRef, {
      pendingIncome: increment(-oldData.amount),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    await batch.commit();
  }

  async getAll(
    filters: { type?: 'expense' | 'income'; segment?: string; month?: string; createdBy?: string } = {},
    pageSize = 20,
    lastDoc?: DocumentSnapshot
  ): Promise<{ transactions: Transaction[]; lastDoc: DocumentSnapshot | null }> {
    const constraints: any[] = [
      where('isDeleted', '==', false),
      orderBy('date', 'desc'),
      limit(pageSize),
    ];

    if (filters.type) constraints.push(where('type', '==', filters.type));
    if (filters.segment) constraints.push(where('segment', '==', filters.segment));
    if (filters.month) constraints.push(where('month', '==', filters.month));
    if (filters.createdBy) constraints.push(where('createdBy', '==', filters.createdBy));
    if (lastDoc) constraints.push(startAfter(lastDoc));

    const q = query(collection(this.firestore, 'transactions'), ...constraints);
    const snapshot = await getDocs(q);
    const transactions = snapshot.docs.map((d) => d.data() as Transaction);
    const last = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;

    return { transactions, lastDoc: last };
  }

  async getById(id: string): Promise<Transaction | null> {
    const docSnap = await getDoc(doc(this.firestore, 'transactions', id));
    if (!docSnap.exists()) return null;
    const data = docSnap.data() as Transaction;
    return data.isDeleted ? null : data;
  }

  async getRecent(count = 10): Promise<Transaction[]> {
    const q = query(
      collection(this.firestore, 'transactions'),
      where('isDeleted', '==', false),
      orderBy('date', 'desc'),
      limit(count)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => d.data() as Transaction);
  }
}
