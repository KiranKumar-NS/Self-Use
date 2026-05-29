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
  arrayUnion,
} from '@angular/fire/firestore';
import { Loan, LoanFormData, Repayment } from '../models/loan.model';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class LoanService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);

  async create(data: LoanFormData): Promise<string> {
    const user = this.authService.userProfile()!;
    const loanRef = doc(collection(this.firestore, 'loans'));

    const batch = writeBatch(this.firestore);
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
      isDeleted: false,
      timeline: [{
        action: 'created',
        by: user.uid,
        byName: user.displayName,
        at: Timestamp.now(),
      }],
      month: data.month,
      year: data.year,
    });

    await batch.commit();
    return loanRef.id;
  }

  async update(id: string, data: LoanFormData): Promise<void> {
    const user = this.authService.userProfile()!;
    const loanRef = doc(this.firestore, 'loans', id);

    const batch = writeBatch(this.firestore);
    batch.update(loanRef, {
      date: Timestamp.fromDate(data.date),
      amount: data.amount,
      type: data.type,
      personName: data.personName,
      purpose: data.purpose,
      segment: data.segment,
      segmentName: data.segmentName,
      month: data.month,
      year: data.year,
      timeline: arrayUnion({
        action: 'updated',
        by: user.uid,
        byName: user.displayName,
        at: Timestamp.now(),
        changes: 'details updated',
      }),
    });

    await batch.commit();
  }

  async addRepayment(loanId: string, amount: number, note: string, date: Date, paidByUid?: string, paidByName?: string): Promise<void> {
    const user = this.authService.userProfile()!;

    await runTransaction(this.firestore, async (transaction) => {
      const loanRef = doc(this.firestore, 'loans', loanId);
      const loanSnap = await transaction.get(loanRef);
      const loan = loanSnap.data() as Loan;

      const newTotalRepaid = loan.totalRepaid + amount;
      const newBalance = loan.amount - newTotalRepaid;
      const newStatus = newBalance <= 0 ? 'completed' : 'partial';

      const payer = paidByName || user.displayName;

      // Add repayment subcollection doc
      const repaymentRef = doc(collection(this.firestore, `loans/${loanId}/repayments`));
      transaction.set(repaymentRef, {
        id: repaymentRef.id,
        date: Timestamp.fromDate(date),
        amount,
        note,
        paidBy: paidByUid || user.uid,
        paidByName: payer,
        recordedBy: user.uid,
        recordedByName: user.displayName,
        createdAt: serverTimestamp(),
      });

      // Update loan + timeline
      transaction.update(loanRef, {
        totalRepaid: newTotalRepaid,
        balanceRemaining: Math.max(0, newBalance),
        repaymentStatus: newStatus,
        timeline: arrayUnion({
          action: 'updated',
          by: user.uid,
          byName: user.displayName,
          at: Timestamp.now(),
          changes: `repayment: +₹${amount.toLocaleString('en-IN')} by ${payer} (${newStatus})`,
        }),
      });
    });
  }

  async addMore(loanId: string, amount: number, note: string, date: Date): Promise<void> {
    const user = this.authService.userProfile()!;

    await runTransaction(this.firestore, async (transaction) => {
      const loanRef = doc(this.firestore, 'loans', loanId);
      const loanSnap = await transaction.get(loanRef);
      const loan = loanSnap.data() as Loan;

      const newAmount = loan.amount + amount;
      const newBalance = loan.balanceRemaining + amount;
      const newStatus = loan.totalRepaid > 0 ? 'partial' : 'pending';

      transaction.update(loanRef, {
        amount: newAmount,
        balanceRemaining: newBalance,
        repaymentStatus: newStatus,
        timeline: arrayUnion({
          action: 'updated',
          by: user.uid,
          byName: user.displayName,
          at: Timestamp.now(),
          changes: `added more: +₹${amount.toLocaleString('en-IN')} (total: ₹${newAmount.toLocaleString('en-IN')})`,
        }),
      });

      // Also record as a repayment-like entry (negative repayment = disbursement)
      const disbursementRef = doc(collection(this.firestore, `loans/${loanId}/repayments`));
      transaction.set(disbursementRef, {
        id: disbursementRef.id,
        date: Timestamp.fromDate(date),
        amount: -amount, // negative = additional disbursement
        note: note || 'Additional amount given',
        recordedBy: user.uid,
        recordedByName: user.displayName,
        createdAt: serverTimestamp(),
      });
    });
  }

  async softDelete(id: string): Promise<void> {
    const user = this.authService.userProfile()!;
    const loanRef = doc(this.firestore, 'loans', id);

    const batch = writeBatch(this.firestore);
    batch.update(loanRef, {
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

  async hardDelete(id: string): Promise<void> {
    // Delete repayments subcollection first
    const repSnap = await getDocs(collection(this.firestore, `loans/${id}/repayments`));
    const batch = writeBatch(this.firestore);
    for (const repDoc of repSnap.docs) {
      batch.delete(repDoc.ref);
    }
    batch.delete(doc(this.firestore, 'loans', id));
    await batch.commit();
  }

  async getAll(
    filters: { type?: 'given' | 'received'; segment?: string; repaymentStatus?: string } = {},
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
