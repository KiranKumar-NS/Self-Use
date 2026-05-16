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
import { Transaction, TransactionFormData, TimelineEntry } from '../models/transaction.model';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class TransactionService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);

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

    batch.set(txnRef, {
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
    });

    // Update monthly summary
    const incField = data.type === 'expense' ? 'totalExpense' : 'totalIncome';
    const profitDelta = data.type === 'income' ? data.amount : -data.amount;
    const catField = data.type === 'expense'
      ? `expenseByCategory.${data.category}`
      : `incomeBySource.${data.category}`;

    batch.set(summaryRef, {
      [incField]: increment(data.amount),
      netProfit: increment(profitDelta),
      [catField]: increment(data.amount),
      month: data.month,
      year: data.year,
      segment: data.segment,
      updatedAt: serverTimestamp(),
    }, { merge: true });

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
    const changesStr = changesList.length > 0 ? changesList.join(', ') : 'details updated';

    // Reverse old summary
    const oldSummaryId = `${oldData.month}-${oldData.segment}`;
    const oldSummaryRef = doc(this.firestore, 'monthlySummaries', oldSummaryId);
    const oldIncField = oldData.type === 'expense' ? 'totalExpense' : 'totalIncome';
    const oldProfitDelta = oldData.type === 'income' ? -oldData.amount : oldData.amount;
    const oldCatField = oldData.type === 'expense'
      ? `expenseByCategory.${oldData.category}`
      : `incomeBySource.${oldData.category}`;

    batch.set(oldSummaryRef, {
      [oldIncField]: increment(-oldData.amount),
      netProfit: increment(oldProfitDelta),
      [oldCatField]: increment(-oldData.amount),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    // Apply new summary
    const newSummaryId = `${data.month}-${data.segment}`;
    const newSummaryRef = doc(this.firestore, 'monthlySummaries', newSummaryId);
    const newIncField = data.type === 'expense' ? 'totalExpense' : 'totalIncome';
    const newProfitDelta = data.type === 'income' ? data.amount : -data.amount;
    const newCatField = data.type === 'expense'
      ? `expenseByCategory.${data.category}`
      : `incomeBySource.${data.category}`;

    batch.set(newSummaryRef, {
      [newIncField]: increment(data.amount),
      netProfit: increment(newProfitDelta),
      [newCatField]: increment(data.amount),
      month: data.month,
      year: data.year,
      segment: data.segment,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    // Update transaction + add timeline entry
    batch.update(txnRef, {
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
      month: data.month,
      year: data.year,
      timeline: arrayUnion({
        action: 'updated',
        by: user.uid,
        byName: user.displayName,
        at: Timestamp.now(),
        changes: changesStr,
      }),
    });

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

    batch.set(summaryRef, {
      [incField]: increment(-oldData.amount),
      netProfit: increment(profitDelta),
      [catField]: increment(-oldData.amount),
      updatedAt: serverTimestamp(),
    }, { merge: true });

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
    return docSnap.exists() ? (docSnap.data() as Transaction) : null;
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
