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
} from '@angular/fire/firestore';
import { Transaction, TransactionFormData } from '../models/transaction.model';
import { AuditChange } from '../models/audit-log.model';
import { AuthService } from './auth.service';
import { getMonthString, getYear } from '../utils/date.utils';

@Injectable({ providedIn: 'root' })
export class TransactionService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);

  async create(data: TransactionFormData): Promise<string> {
    const batch = writeBatch(this.firestore);
    const user = this.authService.userProfile()!;

    const txnRef = doc(collection(this.firestore, 'transactions'));
    const auditRef = doc(collection(this.firestore, 'auditLogs'));
    const summaryId = `${data.month}-${data.segment}`;
    const summaryRef = doc(this.firestore, 'monthlySummaries', summaryId);

    const txnData: any = {
      id: txnRef.id,
      type: data.type,
      date: Timestamp.fromDate(data.date),
      amount: data.amount,
      category: data.category,
      categoryName: data.categoryName,
      segment: data.segment,
      segmentName: data.segmentName,
      description: data.description,
      paymentMethod: data.paymentMethod || 'cash',
      paidBy: data.paidBy || user.uid,
      paidByName: data.paidByName || user.displayName,
      recordedBy: data.type === 'income' ? user.uid : null,
      recordedByName: data.type === 'income' ? user.displayName : null,
      createdBy: user.uid,
      createdByName: user.displayName,
      createdAt: serverTimestamp(),
      updatedBy: null,
      updatedByName: null,
      updatedAt: null,
      isDeleted: false,
      deletedBy: null,
      deletedAt: null,
      month: data.month,
      year: data.year,
    };

    batch.set(txnRef, txnData);

    batch.set(auditRef, {
      id: auditRef.id,
      entityType: 'transaction',
      entityId: txnRef.id,
      action: 'create',
      userId: user.uid,
      userName: user.displayName,
      timestamp: serverTimestamp(),
      changes: [{ field: '*', oldValue: null, newValue: 'created' }],
      month: data.month,
      year: data.year,
    });

    const incField = data.type === 'expense' ? 'totalExpense' : 'totalIncome';
    const profitDelta = data.type === 'income' ? data.amount : -data.amount;
    const catField = data.type === 'expense'
      ? `expenseByCategory.${data.category}`
      : `incomeBySource.${data.category}`;

    batch.set(
      summaryRef,
      {
        [incField]: increment(data.amount),
        netProfit: increment(profitDelta),
        [catField]: increment(data.amount),
        month: data.month,
        year: data.year,
        segment: data.segment,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await batch.commit();
    return txnRef.id;
  }

  async update(id: string, data: TransactionFormData): Promise<void> {
    const batch = writeBatch(this.firestore);
    const user = this.authService.userProfile()!;
    const txnRef = doc(this.firestore, 'transactions', id);
    const auditRef = doc(collection(this.firestore, 'auditLogs'));

    const oldDoc = await getDoc(txnRef);
    const oldData = oldDoc.data() as Transaction;

    const changes: AuditChange[] = [];
    const fields: (keyof TransactionFormData)[] = ['amount', 'category', 'segment', 'description', 'type'];
    for (const field of fields) {
      if ((oldData as any)[field] !== (data as any)[field]) {
        changes.push({ field, oldValue: (oldData as any)[field], newValue: (data as any)[field] });
      }
    }

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

    batch.update(txnRef, {
      type: data.type,
      date: Timestamp.fromDate(data.date),
      amount: data.amount,
      category: data.category,
      categoryName: data.categoryName,
      segment: data.segment,
      segmentName: data.segmentName,
      description: data.description,
      paymentMethod: data.paymentMethod || 'cash',
      paidBy: data.paidBy || user.uid,
      paidByName: data.paidByName || user.displayName,
      updatedBy: user.uid,
      updatedByName: user.displayName,
      updatedAt: serverTimestamp(),
      month: data.month,
      year: data.year,
    });

    batch.set(auditRef, {
      id: auditRef.id,
      entityType: 'transaction',
      entityId: id,
      action: 'update',
      userId: user.uid,
      userName: user.displayName,
      timestamp: serverTimestamp(),
      changes,
      month: data.month,
      year: data.year,
    });

    await batch.commit();
  }

  async softDelete(id: string): Promise<void> {
    const batch = writeBatch(this.firestore);
    const user = this.authService.userProfile()!;
    const txnRef = doc(this.firestore, 'transactions', id);
    const auditRef = doc(collection(this.firestore, 'auditLogs'));

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
      deletedBy: user.uid,
      deletedAt: serverTimestamp(),
    });

    batch.set(auditRef, {
      id: auditRef.id,
      entityType: 'transaction',
      entityId: id,
      action: 'delete',
      userId: user.uid,
      userName: user.displayName,
      timestamp: serverTimestamp(),
      changes: [{ field: 'isDeleted', oldValue: false, newValue: true }],
      month: oldData.month,
      year: oldData.year,
    });

    await batch.commit();
  }

  async getAll(
    filters: {
      type?: 'expense' | 'income';
      segment?: string;
      month?: string;
      createdBy?: string;
    } = {},
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
