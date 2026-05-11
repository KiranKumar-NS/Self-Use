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
  writeBatch,
  runTransaction,
  serverTimestamp,
  Timestamp,
  DocumentSnapshot,
  startAfter,
} from '@angular/fire/firestore';
import { Loan, LoanFormData, Repayment } from '../models/loan.model';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class LoanService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);

  async create(data: LoanFormData): Promise<string> {
    const batch = writeBatch(this.firestore);
    const user = this.authService.userProfile()!;

    const loanRef = doc(collection(this.firestore, 'loans'));
    const auditRef = doc(collection(this.firestore, 'auditLogs'));

    batch.set(loanRef, {
      id: loanRef.id,
      date: Timestamp.fromDate(data.date),
      amount: data.amount,
      type: data.type,
      personName: data.personName,
      purpose: data.purpose,
      segment: data.segment,
      segmentName: data.segmentName,
      repaymentStatus: 'pending',
      totalRepaid: 0,
      balanceRemaining: data.amount,
      recordedBy: user.uid,
      recordedByName: user.displayName,
      createdAt: serverTimestamp(),
      updatedBy: null,
      updatedAt: null,
      isDeleted: false,
      deletedBy: null,
      deletedAt: null,
      month: data.month,
      year: data.year,
    });

    batch.set(auditRef, {
      id: auditRef.id,
      entityType: 'loan',
      entityId: loanRef.id,
      action: 'create',
      userId: user.uid,
      userName: user.displayName,
      timestamp: serverTimestamp(),
      changes: [{ field: '*', oldValue: null, newValue: 'created' }],
      month: data.month,
      year: data.year,
    });

    await batch.commit();
    return loanRef.id;
  }

  async update(id: string, data: LoanFormData): Promise<void> {
    const batch = writeBatch(this.firestore);
    const user = this.authService.userProfile()!;
    const loanRef = doc(this.firestore, 'loans', id);
    const auditRef = doc(collection(this.firestore, 'auditLogs'));

    batch.update(loanRef, {
      date: Timestamp.fromDate(data.date),
      amount: data.amount,
      type: data.type,
      personName: data.personName,
      purpose: data.purpose,
      segment: data.segment,
      segmentName: data.segmentName,
      updatedBy: user.uid,
      updatedAt: serverTimestamp(),
      month: data.month,
      year: data.year,
    });

    batch.set(auditRef, {
      id: auditRef.id,
      entityType: 'loan',
      entityId: id,
      action: 'update',
      userId: user.uid,
      userName: user.displayName,
      timestamp: serverTimestamp(),
      changes: [{ field: '*', oldValue: null, newValue: 'updated' }],
      month: data.month,
      year: data.year,
    });

    await batch.commit();
  }

  async addRepayment(loanId: string, amount: number, note: string, date: Date): Promise<void> {
    const user = this.authService.userProfile()!;

    await runTransaction(this.firestore, async (transaction) => {
      const loanRef = doc(this.firestore, 'loans', loanId);
      const loanSnap = await transaction.get(loanRef);
      const loan = loanSnap.data() as Loan;

      const newTotalRepaid = loan.totalRepaid + amount;
      const newBalance = loan.amount - newTotalRepaid;
      const newStatus = newBalance <= 0 ? 'completed' : 'partial';

      const repaymentRef = doc(collection(this.firestore, `loans/${loanId}/repayments`));
      transaction.set(repaymentRef, {
        id: repaymentRef.id,
        date: Timestamp.fromDate(date),
        amount,
        note,
        recordedBy: user.uid,
        recordedByName: user.displayName,
        createdAt: serverTimestamp(),
      });

      transaction.update(loanRef, {
        totalRepaid: newTotalRepaid,
        balanceRemaining: Math.max(0, newBalance),
        repaymentStatus: newStatus,
        updatedBy: user.uid,
        updatedAt: serverTimestamp(),
      });

      const auditRef = doc(collection(this.firestore, 'auditLogs'));
      transaction.set(auditRef, {
        id: auditRef.id,
        entityType: 'repayment',
        entityId: loanId,
        action: 'create',
        userId: user.uid,
        userName: user.displayName,
        timestamp: serverTimestamp(),
        changes: [
          { field: 'repaymentAmount', oldValue: null, newValue: amount },
          { field: 'totalRepaid', oldValue: loan.totalRepaid, newValue: newTotalRepaid },
          { field: 'repaymentStatus', oldValue: loan.repaymentStatus, newValue: newStatus },
        ],
        month: loan.month,
        year: loan.year,
      });
    });
  }

  async softDelete(id: string): Promise<void> {
    const batch = writeBatch(this.firestore);
    const user = this.authService.userProfile()!;
    const loanRef = doc(this.firestore, 'loans', id);
    const auditRef = doc(collection(this.firestore, 'auditLogs'));

    const oldDoc = await getDoc(loanRef);
    const oldData = oldDoc.data() as Loan;

    batch.update(loanRef, {
      isDeleted: true,
      deletedBy: user.uid,
      deletedAt: serverTimestamp(),
    });

    batch.set(auditRef, {
      id: auditRef.id,
      entityType: 'loan',
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
      type?: 'given' | 'received';
      segment?: string;
      repaymentStatus?: string;
    } = {},
    pageSize = 20,
    lastDoc?: DocumentSnapshot
  ): Promise<{ loans: Loan[]; lastDoc: DocumentSnapshot | null }> {
    const constraints: any[] = [
      where('isDeleted', '==', false),
      orderBy('date', 'desc'),
      limit(pageSize),
    ];

    if (filters.type) constraints.push(where('type', '==', filters.type));
    if (filters.segment) constraints.push(where('segment', '==', filters.segment));
    if (filters.repaymentStatus) constraints.push(where('repaymentStatus', '==', filters.repaymentStatus));
    if (lastDoc) constraints.push(startAfter(lastDoc));

    const q = query(collection(this.firestore, 'loans'), ...constraints);
    const snapshot = await getDocs(q);
    const loans = snapshot.docs.map((d) => d.data() as Loan);
    const last = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;

    return { loans, lastDoc: last };
  }

  async getById(id: string): Promise<Loan | null> {
    const docSnap = await getDoc(doc(this.firestore, 'loans', id));
    return docSnap.exists() ? (docSnap.data() as Loan) : null;
  }

  async getRepayments(loanId: string): Promise<Repayment[]> {
    const q = query(
      collection(this.firestore, `loans/${loanId}/repayments`),
      orderBy('date', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => d.data() as Repayment);
  }

  async getSummary(): Promise<{
    totalGiven: number;
    totalReceived: number;
    pendingGiven: number;
    pendingReceived: number;
  }> {
    const q = query(
      collection(this.firestore, 'loans'),
      where('isDeleted', '==', false)
    );
    const snapshot = await getDocs(q);
    const loans = snapshot.docs.map((d) => d.data() as Loan);

    return {
      totalGiven: loans.filter((l) => l.type === 'given').reduce((sum, l) => sum + l.amount, 0),
      totalReceived: loans.filter((l) => l.type === 'received').reduce((sum, l) => sum + l.amount, 0),
      pendingGiven: loans.filter((l) => l.type === 'given' && l.repaymentStatus !== 'completed').reduce((sum, l) => sum + l.balanceRemaining, 0),
      pendingReceived: loans.filter((l) => l.type === 'received' && l.repaymentStatus !== 'completed').reduce((sum, l) => sum + l.balanceRemaining, 0),
    };
  }
}
