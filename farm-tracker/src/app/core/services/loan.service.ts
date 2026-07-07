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
  increment,
  Timestamp,
  DocumentSnapshot,
  startAfter,
  arrayUnion,
} from '@angular/fire/firestore';
import {
  Loan, LoanFormData, Repayment, EMIEntry, InterestFrequency,
  LoanDeduction, CollateralItem, LoanDocument,
} from '../models/loan.model';
import { AuthService } from './auth.service';
import { getMonthString, getYear } from '../utils/date.utils';

// --- Pure computation helpers (no Firestore) ---

// Gold loan helpers

function purityFactor(purity: string): number {
  switch (purity) {
    case '24K': return 1.0;
    case '22K': return 0.916;
    case '18K': return 0.75;
    default: return 0.916;
  }
}

function computeGoldValue(netWeight: number, purity: string, ratePerGram: number): number {
  return Math.round(netWeight * purityFactor(purity) * ratePerGram * 100) / 100;
}

function rbiLtvRatio(totalGoldValue: number): number {
  if (totalGoldValue <= 250000) return 0.85;
  if (totalGoldValue <= 500000) return 0.80;
  return 0.75;
}

function computeGoldAggregates(collaterals: any[]): { totalGoldWeight: number; totalGoldValue: number } {
  const goldItems = (collaterals ?? []).filter((c: any) => c.type === 'gold' && !c.isReleased);
  return {
    totalGoldWeight: goldItems.reduce((sum: number, c: any) => sum + (c.netWeight ?? c.grossWeight ?? c.weight ?? 0), 0),
    totalGoldValue: goldItems.reduce((sum: number, c: any) => sum + (c.goldValue ?? c.estimatedValue ?? 0), 0),
  };
}

// Interest rate helpers

/** Convert interest rate to annual based on frequency */
function toAnnualRate(rate: number, frequency: InterestFrequency): number {
  switch (frequency) {
    case 'monthly': return rate * 12;
    case 'weekly': return rate * 52;
    case 'annual': return rate;
  }
}

/** Convert annual rate to monthly rate (decimal) */
function annualToMonthlyDecimal(annualPercent: number): number {
  return annualPercent / 100 / 12;
}

/**
 * Generate EMI schedule using reducing-balance method.
 * Used for: loan creation preview, fresh loans with no payments yet.
 *
 * Formula: EMI = P × r × (1+r)^n / ((1+r)^n - 1)
 * where P = principal, r = monthly rate (decimal), n = tenure in months
 */
function generateEMISchedule(
  principal: number,
  annualRate: number,
  tenureMonths: number,
  startDate: Date,
  moratoriumMonths = 0,
  effectiveRate?: number,
): EMIEntry[] {
  const rate = effectiveRate ?? annualRate;
  const r = annualToMonthlyDecimal(rate);
  const entries: EMIEntry[] = [];

  // Moratorium period: interest accrues, added to principal
  let currentPrincipal = principal;
  let emiNumber = 1;
  const start = new Date(startDate);

  for (let i = 0; i < moratoriumMonths; i++) {
    const dueDate = new Date(start);
    dueDate.setMonth(dueDate.getMonth() + i);
    const interestAccrued = currentPrincipal * r;
    currentPrincipal += interestAccrued; // interest added to principal during moratorium

    entries.push({
      emiNumber: emiNumber++,
      dueDate,
      emiAmount: 0,
      principal: 0,
      interest: Math.round(interestAccrued * 100) / 100,
    });
  }

  // EMI period
  const n = tenureMonths;
  if (r === 0) {
    // Zero interest: simple division
    const emi = Math.round((currentPrincipal / n) * 100) / 100;
    let remaining = currentPrincipal;
    for (let i = 0; i < n; i++) {
      const principalPart = i === n - 1 ? remaining : emi; // last EMI takes remainder
      const dueDate = new Date(start);
      dueDate.setMonth(dueDate.getMonth() + moratoriumMonths + i);
      remaining -= principalPart;

      entries.push({
        emiNumber: emiNumber++,
        dueDate,
        emiAmount: principalPart,
        principal: principalPart,
        interest: 0,
      });
    }
    return entries;
  }

  const rPowN = Math.pow(1 + r, n);
  const emi = Math.round((currentPrincipal * r * rPowN / (rPowN - 1)) * 100) / 100;
  let remaining = currentPrincipal;

  for (let i = 0; i < n; i++) {
    const dueDate = new Date(start);
    dueDate.setMonth(dueDate.getMonth() + moratoriumMonths + i);

    const interestPart = Math.round(remaining * r * 100) / 100;
    const principalPart = i === n - 1
      ? remaining  // last EMI clears remaining principal exactly
      : Math.round((emi - interestPart) * 100) / 100;
    const actualEMI = i === n - 1
      ? Math.round((principalPart + interestPart) * 100) / 100
      : emi;

    remaining = Math.max(0, remaining - principalPart);

    entries.push({
      emiNumber: emiNumber++,
      dueDate,
      emiAmount: actualEMI,
      principal: principalPart,
      interest: interestPart,
    });
  }

  return entries;
}

export interface LiveEMIEntry extends EMIEntry {
  status: 'moratorium' | 'paid' | 'upcoming' | 'overdue';
  paidAmount?: number;
  paidDate?: Date;
  paymentReference?: string;
  isPartPayment?: boolean;
}

/**
 * Build the live EMI schedule for display on loan detail page.
 * Merges paid history (from repayments) with projected future EMIs.
 */
function buildLiveEMISchedule(
  loan: Loan,
  paidRepayments: Repayment[],
): LiveEMIEntry[] {
  const now = new Date();
  const entries: LiveEMIEntry[] = [];

  // Separate EMI payments, part-payments, and other repayments
  const emiPayments = paidRepayments
    .filter(r => r.isEMIPayment && r.emiNumber != null)
    .sort((a, b) => (a.emiNumber ?? 0) - (b.emiNumber ?? 0));
  const emiByNumber = new Map<number, Repayment>();
  for (const r of emiPayments) {
    emiByNumber.set(r.emiNumber!, r);
  }

  // Generate the theoretical full schedule
  const startDate = loan.emiStartDate?.toDate()
    ?? loan.disbursementDate?.toDate()
    ?? loan.date.toDate();
  const annualRate = loan.interestRate ?? 0;
  const tenure = loan.tenure ?? 0;
  const moratorium = loan.moratoriumMonths ?? 0;
  const effectiveRate = loan.isSubsidized ? loan.effectiveRate : undefined;

  const theoreticalSchedule = generateEMISchedule(
    loan.sanctionedAmount ?? loan.amount,
    annualRate,
    tenure,
    startDate,
    moratorium,
    effectiveRate,
  );

  // If we have rate changes or part-payments, regenerate remaining schedule
  const emisPaid = loan.emisPaid ?? 0;
  const hasPartPayments = (loan.totalPartPayments ?? 0) > 0;
  const hasRateChanges = (loan.rateChanges?.length ?? 0) > 0;

  // Use theoretical for paid EMIs, regenerate for remaining if needed
  let remainingSchedule: EMIEntry[] | null = null;
  if ((hasPartPayments || hasRateChanges) && emisPaid > 0 && emisPaid < (moratorium + tenure)) {
    const currentRate = loan.interestRate ?? annualRate;
    const remainingTenure = tenure - emisPaid;
    const outstanding = loan.outstandingBalance ?? 0;
    if (remainingTenure > 0 && outstanding > 0) {
      const nextStartDate = new Date(startDate);
      nextStartDate.setMonth(nextStartDate.getMonth() + moratorium + emisPaid);
      remainingSchedule = generateEMISchedule(outstanding, currentRate, remainingTenure, nextStartDate, 0, effectiveRate);
    }
  }

  // Build live entries
  for (let i = 0; i < theoreticalSchedule.length; i++) {
    const entry = theoreticalSchedule[i];
    const paid = emiByNumber.get(entry.emiNumber);

    // Moratorium entries
    if (entry.emiAmount === 0 && i < moratorium) {
      entries.push({ ...entry, status: 'moratorium' });
      continue;
    }

    // Paid EMIs: show actual paid data
    if (paid) {
      entries.push({
        ...entry,
        status: 'paid',
        emiAmount: paid.amount,
        principal: paid.principalPortion ?? entry.principal,
        interest: paid.interestPortion ?? entry.interest,
        paidAmount: paid.amount,
        paidDate: paid.date.toDate(),
        paymentReference: paid.paymentReference,
      });
      continue;
    }

    // Unpaid EMIs: use regenerated schedule if available
    if (remainingSchedule) {
      const adjustedIndex = entry.emiNumber - moratorium - emisPaid - 1;
      if (adjustedIndex >= 0 && adjustedIndex < remainingSchedule.length) {
        const regen = remainingSchedule[adjustedIndex];
        entries.push({
          ...regen,
          emiNumber: entry.emiNumber,
          dueDate: entry.dueDate,
          status: entry.dueDate < now ? 'overdue' : 'upcoming',
        });
        continue;
      }
    }

    // Fallback to theoretical
    entries.push({
      ...entry,
      status: entry.dueDate < now ? 'overdue' : 'upcoming',
    });
  }

  // Add part-payment entries inline (between EMIs)
  const partPayments = paidRepayments
    .filter(r => r.isPartPayment)
    .sort((a, b) => a.date.toDate().getTime() - b.date.toDate().getTime());

  for (const pp of partPayments) {
    const ppDate = pp.date.toDate();
    // Find insertion index: after the last EMI with dueDate <= ppDate
    let insertIdx = entries.findIndex(e => e.dueDate > ppDate);
    if (insertIdx === -1) insertIdx = entries.length;

    entries.splice(insertIdx, 0, {
      emiNumber: 0, // 0 indicates part-payment, not a regular EMI
      dueDate: ppDate,
      emiAmount: pp.amount,
      principal: pp.principalPortion ?? pp.amount,
      interest: 0,
      status: 'paid',
      paidAmount: pp.amount,
      paidDate: ppDate,
      paymentReference: pp.paymentReference,
      isPartPayment: true,
    });
  }

  return entries;
}

// --- Service class ---

@Injectable({ providedIn: 'root' })
export class LoanService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);

  // Expose pure functions as service methods
  generateEMISchedule = generateEMISchedule;
  buildLiveEMISchedule = buildLiveEMISchedule;
  toAnnualRate = toAnnualRate;
  purityFactor = purityFactor;
  computeGoldValue = computeGoldValue;
  rbiLtvRatio = rbiLtvRatio;
  computeGoldAggregates = computeGoldAggregates;

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

    const oldDoc = await getDoc(loanRef);
    const oldData = oldDoc.data() as Loan;

    // Block amount change on simple loans linked to a formal loan
    if (oldData.parentFormalLoanId && oldData.amount !== data.amount) {
      throw new Error('Cannot edit amount of a personal withdrawal. Use "Add More" to increase, or delete and recreate.');
    }

    // Formal loans: only allow cosmetic edits
    if (oldData.loanCategory === 'formal') {
      const changesList: string[] = [];
      const updates: Record<string, any> = {};

      if (oldData.personName !== data.personName) {
        changesList.push(`person: ${oldData.personName}→${data.personName}`);
        updates['personName'] = data.personName;
      }
      if (oldData.purpose !== data.purpose) {
        changesList.push(`purpose updated`);
        updates['purpose'] = data.purpose;
      }
      if (data.loanSourceName && oldData.loanSourceName !== data.loanSourceName) {
        changesList.push(`source: ${oldData.loanSourceName}→${data.loanSourceName}`);
        updates['loanSourceName'] = data.loanSourceName;
      }
      if (data.accountNumber && oldData.accountNumber !== data.accountNumber) {
        changesList.push(`account: updated`);
        updates['accountNumber'] = data.accountNumber;
      }

      if (Object.keys(updates).length === 0) return;

      updates['timeline'] = arrayUnion({
        action: 'updated',
        by: user.uid,
        byName: user.displayName,
        at: Timestamp.now(),
        changes: changesList.join(', '),
      });

      const batch = writeBatch(this.firestore);
      batch.update(loanRef, updates);
      await batch.commit();
      return;
    }

    // Simple loan update (existing logic)
    const newBalance = data.amount - oldData.totalRepaid;
    const newStatus = newBalance <= 0 ? 'completed' : oldData.totalRepaid > 0 ? 'partial' : 'pending';

    const changesList: string[] = [];
    if (oldData.amount !== data.amount) changesList.push(`amount: ₹${oldData.amount.toLocaleString('en-IN')}→₹${data.amount.toLocaleString('en-IN')}`);
    if (oldData.personName !== data.personName) changesList.push(`person: ${oldData.personName}→${data.personName}`);
    if (oldData.segment !== data.segment) changesList.push(`segment: ${oldData.segmentName}→${data.segmentName}`);

    const batch = writeBatch(this.firestore);
    batch.update(loanRef, {
      date: Timestamp.fromDate(data.date),
      amount: data.amount,
      type: data.type,
      personName: data.personName,
      purpose: data.purpose,
      segment: data.segment,
      segmentName: data.segmentName,
      balanceRemaining: Math.max(0, newBalance),
      repaymentStatus: newStatus,
      month: data.month,
      year: data.year,
      timeline: arrayUnion({
        action: 'updated',
        by: user.uid,
        byName: user.displayName,
        at: Timestamp.now(),
        changes: changesList.length > 0 ? changesList.join(', ') : 'details updated',
      }),
    });

    await batch.commit();
  }

  async addRepayment(loanId: string, amount: number, note: string, date: Date, paidByUid?: string, paidByName?: string): Promise<void> {
    const user = this.authService.userProfile()!;

    await runTransaction(this.firestore, async (transaction) => {
      // All reads FIRST (Firestore requirement)
      const loanRef = doc(this.firestore, 'loans', loanId);
      const loanSnap = await transaction.get(loanRef);
      const loan = loanSnap.data() as Loan;

      // Read parent formal loan if exists (must be before any writes)
      let parentRef: any = null;
      if (loan.parentFormalLoanId) {
        parentRef = doc(this.firestore, 'loans', loan.parentFormalLoanId);
        await transaction.get(parentRef); // read before writes
      }

      if (amount <= 0) throw new Error('Amount must be greater than 0');
      if (amount > loan.balanceRemaining) {
        throw new Error(`Repayment ₹${amount.toLocaleString('en-IN')} exceeds balance ₹${loan.balanceRemaining.toLocaleString('en-IN')}`);
      }

      const newTotalRepaid = loan.totalRepaid + amount;
      const newBalance = loan.amount - newTotalRepaid;
      const newStatus = newBalance <= 0 ? 'completed' : 'partial';

      const payer = paidByName || user.displayName;

      // All writes AFTER reads
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

      // Sync parent formal loan utilization
      if (parentRef) {
        transaction.update(parentRef, {
          utilizationTotal: increment(-amount),
          utilizationRemaining: increment(amount),
          timeline: arrayUnion({
            action: 'updated',
            by: user.uid,
            byName: user.displayName,
            at: Timestamp.now(),
            changes: `₹${amount.toLocaleString('en-IN')} returned by ${loan.personName}`,
          }),
        });
      }
    });
  }

  async addMore(loanId: string, amount: number, note: string, date: Date): Promise<void> {
    const user = this.authService.userProfile()!;
    if (amount <= 0) throw new Error('Amount must be greater than 0');

    await runTransaction(this.firestore, async (transaction) => {
      // All reads FIRST (Firestore requirement)
      const loanRef = doc(this.firestore, 'loans', loanId);
      const loanSnap = await transaction.get(loanRef);
      const loan = loanSnap.data() as Loan;

      // Read parent if exists (must be before writes)
      let parentRef: any = null;
      let parentRemaining = 0;
      if (loan.parentFormalLoanId) {
        parentRef = doc(this.firestore, 'loans', loan.parentFormalLoanId);
        const parentSnap = await transaction.get(parentRef);
        if (parentSnap.exists()) {
          parentRemaining = (parentSnap.data() as Loan).utilizationRemaining ?? 0;
        }
      }

      // Validate parent has enough remaining
      if (parentRef && amount > parentRemaining) {
        throw new Error(`Additional amount ₹${amount.toLocaleString('en-IN')} exceeds parent loan remaining ₹${parentRemaining.toLocaleString('en-IN')}`);
      }

      // All writes AFTER reads
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

      const disbursementRef = doc(collection(this.firestore, `loans/${loanId}/repayments`));
      transaction.set(disbursementRef, {
        id: disbursementRef.id,
        date: Timestamp.fromDate(date),
        amount: -amount,
        note: note || 'Additional amount given',
        recordedBy: user.uid,
        recordedByName: user.displayName,
        createdAt: serverTimestamp(),
      });

      // Sync parent formal loan
      if (parentRef) {
        transaction.update(parentRef, {
          utilizationTotal: increment(amount),
          utilizationRemaining: increment(-amount),
          timeline: arrayUnion({
            action: 'updated',
            by: user.uid,
            byName: user.displayName,
            at: Timestamp.now(),
            changes: `personal withdrawal to ${loan.personName} increased by ₹${amount.toLocaleString('en-IN')}`,
          }),
        });
      }
    });
  }

  async softDelete(id: string): Promise<void> {
    const user = this.authService.userProfile()!;
    const loanRef = doc(this.firestore, 'loans', id);

    // Read loan first to check for linked data and parent sync
    const loanSnap = await getDoc(loanRef);
    const loan = loanSnap.data() as Loan;

    // Formal loans: block delete if linked data exists
    if (loan.loanCategory === 'formal') {
      const [linkedTxns, linkedLoans, repayments] = await Promise.all([
        getDocs(query(collection(this.firestore, 'transactions'), where('linkedLoanId', '==', id), where('isDeleted', '==', false), limit(1))),
        getDocs(query(collection(this.firestore, 'loans'), where('parentFormalLoanId', '==', id), where('isDeleted', '==', false), limit(1))),
        getDocs(query(collection(this.firestore, `loans/${id}/repayments`), limit(1))),
      ]);
      if (!linkedTxns.empty || !linkedLoans.empty || !repayments.empty) {
        throw new Error('Cannot delete a formal loan with existing transactions, repayments, or personal withdrawals. Close the loan first.');
      }
    }

    // Simple loans with parent: reverse utilization on parent
    if (loan.parentFormalLoanId) {
      await runTransaction(this.firestore, async (transaction) => {
        const parentRef = doc(this.firestore, 'loans', loan.parentFormalLoanId!);
        const parentSnap = await transaction.get(parentRef);
        // Re-read loan inside transaction for consistency
        const freshLoanSnap = await transaction.get(loanRef);
        const freshLoan = freshLoanSnap.data() as Loan;
        if (parentSnap.exists()) {
          // Only restore the unreturned portion (returned money was already restored by addRepayment)
          // utilizationTotal was incremented by loan.amount at creation, and decremented by each repayment
          // So remaining utilizationTotal contribution = loan.balanceRemaining
          transaction.update(parentRef, {
            utilizationTotal: increment(-freshLoan.balanceRemaining),
            utilizationRemaining: increment(freshLoan.balanceRemaining),
            timeline: arrayUnion({
              action: 'updated',
              by: user.uid,
              byName: user.displayName,
              at: Timestamp.now(),
              changes: `personal withdrawal to ${freshLoan.personName} deleted (₹${freshLoan.balanceRemaining.toLocaleString('en-IN')} restored)`,
            }),
          });
        }
        // Soft-delete the simple loan in same transaction
        transaction.update(loanRef, {
          isDeleted: true,
          timeline: arrayUnion({
            action: 'deleted',
            by: user.uid,
            byName: user.displayName,
            at: Timestamp.now(),
          }),
        });
      });
      return;
    }

    // Normal soft-delete (no parent)
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
    if (!docSnap.exists()) return null;
    const data = docSnap.data() as Loan;
    return data.isDeleted ? null : data;
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
    totalSanctioned: number;
    totalOutstanding: number;
    upcomingEMICount: number;
    upcomingEMIAmount: number;
    totalInterestPaid: number;
  }> {
    const q = query(
      collection(this.firestore, 'loans'),
      where('isDeleted', '==', false)
    );
    const snapshot = await getDocs(q);
    const loans = snapshot.docs.map((d) => d.data() as Loan);

    // Formal loan metrics
    const formalLoans = loans.filter(l => l.loanCategory === 'formal');
    const activeFormal = formalLoans.filter(l => l.repaymentStatus !== 'completed');
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    let upcomingEMICount = 0;
    let upcomingEMIAmount = 0;
    for (const loan of activeFormal) {
      if (loan.nextPaymentDueDate) {
        const dueDate = loan.nextPaymentDueDate.toDate();
        if (dueDate <= thirtyDaysFromNow) {
          upcomingEMICount++;
          upcomingEMIAmount += loan.repaymentType === 'emi'
            ? (loan.emiAmount ?? 0)
            : (loan.interestAmountPerPeriod ?? 0);
        }
      }
    }

    return {
      totalGiven: loans.filter((l) => l.type === 'given').reduce((sum, l) => sum + l.amount, 0),
      totalReceived: loans.filter((l) => l.type === 'received').reduce((sum, l) => sum + l.amount, 0),
      pendingGiven: loans.filter((l) => l.type === 'given' && l.repaymentStatus !== 'completed')
        .reduce((sum, l) => sum + (l.loanCategory === 'formal' ? (l.outstandingBalance ?? 0) : l.balanceRemaining), 0),
      pendingReceived: loans.filter((l) => l.type === 'received' && l.repaymentStatus !== 'completed')
        .reduce((sum, l) => sum + (l.loanCategory === 'formal' ? (l.outstandingBalance ?? 0) : l.balanceRemaining), 0),
      totalSanctioned: formalLoans.reduce((sum, l) => sum + (l.sanctionedAmount ?? 0), 0),
      totalOutstanding: activeFormal.reduce((sum, l) => sum + (l.outstandingBalance ?? 0), 0),
      upcomingEMICount,
      upcomingEMIAmount,
      totalInterestPaid: formalLoans.reduce((sum, l) => sum + (l.totalInterestPaid ?? 0), 0),
    };
  }

  // ==================== Formal Loan Methods ====================

  /** Create a formal loan — 1 write, 0 reads */
  async createFormalLoan(data: LoanFormData): Promise<string> {
    const user = this.authService.userProfile()!;
    const loanRef = doc(collection(this.firestore, 'loans'));

    // Compute deductions
    const deductions: LoanDeduction[] = (data.deductions ?? []).map((d, i) => ({
      ...d,
      id: `ded_${Date.now()}_${i}`,
      date: Timestamp.fromDate(d.date instanceof Date ? d.date : new Date(d.date as any)),
    })) as LoanDeduction[];
    const totalDeductions = deductions.reduce((sum, d) => sum + d.amount, 0);
    const financedDeductions = deductions.filter(d => d.isFinanced).reduce((sum, d) => sum + d.amount, 0);
    const sanctionedAmount = data.sanctionedAmount ?? data.amount;
    const netDisbursedAmount = sanctionedAmount - financedDeductions;

    // Compute interest rate (always store as annual)
    const annualRate = data.interestRate ?? toAnnualRate(data.interestRateInput ?? 0, data.interestFrequency ?? 'annual');

    // Compute EMI details
    const tenure = data.tenure ?? 0;
    const moratorium = data.moratoriumMonths ?? 0;
    const effectiveRate = data.isSubsidized ? data.effectiveRate : undefined;
    let emiAmount = data.emiAmount;
    let totalEMIs = data.totalEMIs ?? tenure;

    if (data.repaymentType === 'emi' && tenure > 0 && !emiAmount) {
      const r = annualToMonthlyDecimal(effectiveRate ?? annualRate);
      if (r > 0) {
        const rPowN = Math.pow(1 + r, tenure);
        emiAmount = Math.round((sanctionedAmount * r * rPowN / (rPowN - 1)) * 100) / 100;
      } else {
        emiAmount = Math.round((sanctionedAmount / tenure) * 100) / 100;
      }
    }

    // Compute interest-only fields
    let interestAmountPerPeriod: number | undefined;
    if (data.repaymentType === 'interest_only') {
      const freq = data.interestPaymentFrequency ?? data.interestFrequency ?? 'monthly';
      const ratePerPeriod = freq === 'weekly'
        ? annualRate / 52 / 100
        : annualRate / 12 / 100;
      interestAmountPerPeriod = Math.round(sanctionedAmount * ratePerPeriod * 100) / 100;
    }

    // Compute next payment due date
    const disbursementDate = data.disbursementDate ? Timestamp.fromDate(data.disbursementDate) : Timestamp.fromDate(data.date);
    const startDate = data.disbursementDate ?? data.date;
    let nextPaymentDueDate: Timestamp;
    if (data.repaymentType === 'interest_only') {
      const freq = data.interestPaymentFrequency ?? 'monthly';
      const next = new Date(startDate);
      if (freq === 'weekly') next.setDate(next.getDate() + 7);
      else next.setMonth(next.getMonth() + 1);
      nextPaymentDueDate = Timestamp.fromDate(next);
    } else {
      const next = new Date(startDate);
      next.setMonth(next.getMonth() + moratorium + 1);
      nextPaymentDueDate = Timestamp.fromDate(next);
    }

    // Compute EMI start date (after moratorium)
    let emiStartDate: Timestamp | undefined;
    if (data.repaymentType === 'emi' && moratorium > 0) {
      const emiStart = new Date(startDate);
      emiStart.setMonth(emiStart.getMonth() + moratorium);
      emiStartDate = Timestamp.fromDate(emiStart);
    }

    // Build collateral items
    const collaterals: CollateralItem[] = (data.collaterals ?? []).map((c, i) => {
      const item = { ...c, id: `col_${Date.now()}_${i}` } as CollateralItem;
      // Auto-compute gold value if gold item with weight and rate
      if (item.type === 'gold' && (item.netWeight ?? item.grossWeight ?? item.weight ?? 0) > 0 && (item.goldRatePerGram ?? 0) > 0) {
        const nw = item.netWeight ?? item.grossWeight ?? item.weight ?? 0;
        item.goldValue = computeGoldValue(nw, item.purity ?? '22K', item.goldRatePerGram!);
        item.estimatedValue = item.goldValue;
      }
      return item;
    }) as CollateralItem[];
    const totalCollateralValue = collaterals.reduce((sum, c) => sum + c.estimatedValue, 0);

    // Gold loan aggregates
    const goldAgg = computeGoldAggregates(collaterals);
    const ltvRatio = data.loanSource === 'gold_loan'
      ? (data.ltvRatio ?? rbiLtvRatio(goldAgg.totalGoldValue))
      : undefined;
    const eligibleLoanAmount = ltvRatio ? Math.round(goldAgg.totalGoldValue * ltvRatio) : undefined;

    // Build document items
    const documents: LoanDocument[] = (data.documents ?? []).map((d, i) => ({
      ...d,
      id: `doc_${Date.now()}_${i}`,
    })) as LoanDocument[];

    // Build segments
    const segments = data.segments ?? [data.segment];
    const segmentNames = data.segmentNames ?? [data.segmentName];

    const batch = writeBatch(this.firestore);
    batch.set(loanRef, {
      id: loanRef.id,
      date: Timestamp.fromDate(data.date),
      amount: sanctionedAmount,
      type: data.type,
      personName: data.personName,
      purpose: data.purpose,
      segment: data.segment,
      segmentName: data.segmentName,
      repaymentStatus: 'pending',
      totalRepaid: 0,
      balanceRemaining: sanctionedAmount,
      recordedBy: user.uid,
      recordedByName: user.displayName,
      createdAt: serverTimestamp(),
      isDeleted: false,
      timeline: [{
        action: 'created',
        by: user.uid,
        byName: user.displayName,
        at: Timestamp.now(),
        changes: `formal loan from ${data.loanSourceName ?? data.loanSource ?? 'unknown'}`,
      }],
      month: data.month,
      year: data.year,

      // Formal loan fields
      loanCategory: 'formal',
      loanSource: data.loanSource,
      loanSourceName: data.loanSourceName,
      accountNumber: data.accountNumber,
      sanctionedAmount,
      netDisbursedAmount,
      totalDeductions,
      deductions,
      disbursementDate,
      repaymentType: data.repaymentType ?? 'emi',
      interestType: data.interestType ?? 'fixed',
      interestFrequency: data.interestFrequency ?? 'annual',
      interestRateInput: data.interestRateInput,
      interestRate: annualRate,

      // EMI mode
      ...(data.repaymentType === 'emi' ? {
        tenure,
        emiAmount,
        totalEMIs,
        emisPaid: 0,
        moratoriumMonths: moratorium,
        emiStartDate: emiStartDate ?? null,
      } : {}),

      // Interest-only mode
      ...(data.repaymentType === 'interest_only' ? {
        interestPaymentFrequency: data.interestPaymentFrequency ?? data.interestFrequency ?? 'monthly',
        interestAmountPerPeriod,
        totalInterestPaymentsMade: 0,
      } : {}),

      // Common
      totalInterestPaid: 0,
      totalPrincipalPaid: 0,
      outstandingBalance: sanctionedAmount,
      totalPartPayments: 0,
      totalPenaltyPaid: 0,
      nextPaymentDueDate,
      nextPaymentNumber: 1,

      // Collateral
      collaterals: collaterals.length > 0 ? collaterals : null,
      totalCollateralValue: collaterals.length > 0 ? totalCollateralValue : null,

      // Documents
      documents: documents.length > 0 ? documents : null,

      // Subsidy
      isSubsidized: data.isSubsidized ?? false,
      subsidyDetails: data.subsidyDetails ?? null,
      effectiveRate: effectiveRate ?? null,

      // Balance transfer
      replacesLoanId: data.replacesLoanId ?? null,
      isBalanceTransfer: !!data.replacesLoanId,

      // Utilization
      utilizationTotal: 0,
      utilizationRemaining: netDisbursedAmount,

      // Multi-segment
      segments,
      segmentNames,

      // Holder
      heldByUid: data.heldByUid ?? null,
      heldByName: data.heldByName ?? null,

      // Gold loan
      pledgeReceiptNumber: data.pledgeReceiptNumber ?? null,
      ltvRatio: ltvRatio ?? null,
      totalGoldWeight: goldAgg.totalGoldWeight > 0 ? goldAgg.totalGoldWeight : null,
      totalGoldValue: goldAgg.totalGoldValue > 0 ? goldAgg.totalGoldValue : null,
      eligibleLoanAmount: eligibleLoanAmount ?? null,
      renewedFromLoanId: data.renewedFromLoanId ?? null,
      isRenewal: !!data.renewedFromLoanId,
    });

    await batch.commit();
    return loanRef.id;
  }

  /** Add a deduction to a formal loan — 1 read, 1 write */
  async addDeduction(loanId: string, deduction: Omit<LoanDeduction, 'id'>): Promise<void> {
    const user = this.authService.userProfile()!;

    await runTransaction(this.firestore, async (transaction) => {
      const loanRef = doc(this.firestore, 'loans', loanId);
      const loanSnap = await transaction.get(loanRef);
      const loan = loanSnap.data() as Loan;

      if (loan.loanCategory !== 'formal') {
        throw new Error('Deductions can only be added to formal loans');
      }

      const newDeduction: LoanDeduction = {
        ...deduction,
        id: `ded_${Date.now()}`,
        date: deduction.date instanceof Timestamp ? deduction.date : Timestamp.fromDate(deduction.date as any),
      } as LoanDeduction;

      const updatedDeductions = [...(loan.deductions ?? []), newDeduction];
      const totalDeductions = updatedDeductions.reduce((sum, d) => sum + d.amount, 0);
      const financedDeductions = updatedDeductions.filter(d => d.isFinanced).reduce((sum, d) => sum + d.amount, 0);
      const newNetDisbursed = (loan.sanctionedAmount ?? loan.amount) - financedDeductions;
      const oldNetDisbursed = loan.netDisbursedAmount ?? (loan.sanctionedAmount ?? loan.amount);
      const netChange = oldNetDisbursed - newNetDisbursed;

      transaction.update(loanRef, {
        deductions: updatedDeductions,
        totalDeductions,
        netDisbursedAmount: newNetDisbursed,
        utilizationRemaining: (loan.utilizationRemaining ?? oldNetDisbursed) - netChange,
        timeline: arrayUnion({
          action: 'updated',
          by: user.uid,
          byName: user.displayName,
          at: Timestamp.now(),
          changes: `deduction added: ${deduction.type} ₹${deduction.amount.toLocaleString('en-IN')} to ${deduction.paidTo}`,
        }),
      });
    });
  }

  /** Add business utilization — auto-creates expense transaction. 2 reads, 3 writes */
  async addBusinessUtilization(
    loanId: string,
    data: {
      description: string;
      amount: number;
      date: Date;
      category: string;
      categoryName: string;
      segment: string;
      segmentName: string;
      paymentMethod?: 'cash' | 'upi';
      paidBy?: string;
      paidByName?: string;
    },
  ): Promise<string> {
    const user = this.authService.userProfile()!;
    let txnId = '';

    await runTransaction(this.firestore, async (transaction) => {
      // Read loan
      const loanRef = doc(this.firestore, 'loans', loanId);
      const loanSnap = await transaction.get(loanRef);
      const loan = loanSnap.data() as Loan;

      if (loan.loanCategory !== 'formal') {
        throw new Error('Utilization can only be added to formal loans');
      }
      const remaining = loan.utilizationRemaining ?? 0;
      if (data.amount > remaining) {
        throw new Error(`Amount ₹${data.amount.toLocaleString('en-IN')} exceeds remaining ₹${remaining.toLocaleString('en-IN')}`);
      }

      // Create expense transaction
      const txnRef = doc(collection(this.firestore, 'transactions'));
      txnId = txnRef.id;
      const month = getMonthString(data.date);
      const year = getYear(data.date);

      transaction.set(txnRef, {
        id: txnRef.id,
        type: 'expense',
        date: Timestamp.fromDate(data.date),
        amount: data.amount,
        category: data.category,
        categoryName: data.categoryName,
        segment: data.segment,
        segmentName: data.segmentName,
        description: data.description,
        paymentMethod: data.paymentMethod ?? 'upi',
        paidBy: data.paidBy ?? user.uid,
        paidByName: data.paidByName ?? user.displayName,
        createdBy: user.uid,
        createdByName: user.displayName,
        createdAt: serverTimestamp(),
        isDeleted: false,
        timeline: [{
          action: 'created',
          by: user.uid,
          byName: user.displayName,
          at: Timestamp.now(),
        }],
        expensePaymentStatus: 'paid',
        linkedLoanId: loanId,
        month,
        year,
      });

      // Update monthly summary (replicates TransactionService.create pattern)
      const summaryId = `${month}-${data.segment}`;
      const summaryRef = doc(this.firestore, 'monthlySummaries', summaryId);
      const personKey = data.paidBy === 'other' && data.paidByName
        ? data.paidByName.trim().replace(/\s+/g, ' ')
            .split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
            .replace(/[.$/\[\]#]/g, '_')
        : (data.paidBy ?? user.uid);

      transaction.set(summaryRef, {
        totalExpense: increment(data.amount),
        netProfit: increment(-data.amount),
        [`expenseByCategory.${data.category}`]: increment(data.amount),
        [`expenseByPerson.${personKey}`]: increment(data.amount),
        month,
        year,
        segment: data.segment,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // Update loan utilization
      transaction.update(loanRef, {
        utilizationTotal: increment(data.amount),
        utilizationRemaining: increment(-data.amount),
        timeline: arrayUnion({
          action: 'updated',
          by: user.uid,
          byName: user.displayName,
          at: Timestamp.now(),
          changes: `utilization: ₹${data.amount.toLocaleString('en-IN')} for ${data.description}`,
        }),
      });
    });

    return txnId;
  }

  /** Add personal utilization — creates linked simple owe/lent entry. 1 read, 2 writes */
  async addPersonalUtilization(
    loanId: string,
    personName: string,
    personUid: string | undefined,
    amount: number,
    note: string,
    date: Date,
  ): Promise<string> {
    const user = this.authService.userProfile()!;
    let simpleLoanId = '';

    await runTransaction(this.firestore, async (transaction) => {
      // Read formal loan
      const loanRef = doc(this.firestore, 'loans', loanId);
      const loanSnap = await transaction.get(loanRef);
      const loan = loanSnap.data() as Loan;

      if (loan.loanCategory !== 'formal') {
        throw new Error('Personal utilization can only be added to formal loans');
      }
      const remaining = loan.utilizationRemaining ?? 0;
      if (amount > remaining) {
        throw new Error(`Amount ₹${amount.toLocaleString('en-IN')} exceeds remaining ₹${remaining.toLocaleString('en-IN')}`);
      }

      // Create linked simple loan (type: 'given' = we gave money to person)
      const simpleLoanRef = doc(collection(this.firestore, 'loans'));
      simpleLoanId = simpleLoanRef.id;
      const month = getMonthString(date);
      const year = getYear(date);

      transaction.set(simpleLoanRef, {
        id: simpleLoanRef.id,
        date: Timestamp.fromDate(date),
        amount,
        type: 'given',
        personName,
        purpose: note || `Personal use from ${loan.loanSourceName ?? 'loan'}`,
        segment: loan.segment,
        segmentName: loan.segmentName,
        repaymentStatus: 'pending',
        totalRepaid: 0,
        balanceRemaining: amount,
        recordedBy: user.uid,
        recordedByName: user.displayName,
        createdAt: serverTimestamp(),
        isDeleted: false,
        timeline: [{
          action: 'created',
          by: user.uid,
          byName: user.displayName,
          at: Timestamp.now(),
          changes: `personal withdrawal from ${loan.loanSourceName ?? 'formal loan'}`,
        }],
        month,
        year,
        loanCategory: 'simple',
        parentFormalLoanId: loanId,
        personUid: personUid ?? null,
      });

      // Update formal loan utilization
      transaction.update(loanRef, {
        utilizationTotal: increment(amount),
        utilizationRemaining: increment(-amount),
        timeline: arrayUnion({
          action: 'updated',
          by: user.uid,
          byName: user.displayName,
          at: Timestamp.now(),
          changes: `personal use: ₹${amount.toLocaleString('en-IN')} to ${personName}`,
        }),
      });
    });

    return simpleLoanId;
  }

  /** Remove a deduction from a formal loan — 1 read, 1 write */
  async removeDeduction(loanId: string, deductionId: string): Promise<void> {
    const user = this.authService.userProfile()!;

    await runTransaction(this.firestore, async (transaction) => {
      const loanRef = doc(this.firestore, 'loans', loanId);
      const loanSnap = await transaction.get(loanRef);
      const loan = loanSnap.data() as Loan;

      if (loan.loanCategory !== 'formal') {
        throw new Error('Deductions can only be removed from formal loans');
      }

      const removed = (loan.deductions ?? []).find(d => d.id === deductionId);
      if (!removed) {
        throw new Error('Deduction not found');
      }

      const updatedDeductions = (loan.deductions ?? []).filter(d => d.id !== deductionId);
      const totalDeductions = updatedDeductions.reduce((sum, d) => sum + d.amount, 0);
      const financedDeductions = updatedDeductions.filter(d => d.isFinanced).reduce((sum, d) => sum + d.amount, 0);
      const newNetDisbursed = (loan.sanctionedAmount ?? loan.amount) - financedDeductions;
      const oldNetDisbursed = loan.netDisbursedAmount ?? (loan.sanctionedAmount ?? loan.amount);
      const netChange = newNetDisbursed - oldNetDisbursed;

      transaction.update(loanRef, {
        deductions: updatedDeductions,
        totalDeductions,
        netDisbursedAmount: newNetDisbursed,
        utilizationRemaining: (loan.utilizationRemaining ?? oldNetDisbursed) + netChange,
        timeline: arrayUnion({
          action: 'updated',
          by: user.uid,
          byName: user.displayName,
          at: Timestamp.now(),
          changes: `deduction removed: ${removed.type} ₹${removed.amount.toLocaleString('en-IN')}`,
        }),
      });
    });
  }

  // ==================== EMI Payment ====================

  /** Record an EMI payment — auto-creates expense transaction. 2 reads, 4 writes */
  async addEMIPayment(
    loanId: string,
    data: {
      amount: number;
      emiNumber: number;
      principalPortion: number;
      interestPortion: number;
      date: Date;
      paymentReference?: string;
      note?: string;
      paidByUid?: string;
      paidByName?: string;
    },
  ): Promise<void> {
    const user = this.authService.userProfile()!;

    await runTransaction(this.firestore, async (transaction) => {
      const loanRef = doc(this.firestore, 'loans', loanId);
      const loanSnap = await transaction.get(loanRef);
      const loan = loanSnap.data() as Loan;

      if (loan.loanCategory !== 'formal' || loan.repaymentType !== 'emi') {
        throw new Error('EMI payments can only be made on EMI-type formal loans');
      }

      const payer = data.paidByName ?? user.displayName;
      const month = getMonthString(data.date);
      const year = getYear(data.date);
      const sourceName = loan.loanSourceName ?? loan.personName;

      // Create repayment doc
      const repRef = doc(collection(this.firestore, `loans/${loanId}/repayments`));
      transaction.set(repRef, {
        id: repRef.id,
        date: Timestamp.fromDate(data.date),
        amount: data.amount,
        note: data.note ?? `EMI #${data.emiNumber}`,
        paidBy: data.paidByUid ?? user.uid,
        paidByName: payer,
        recordedBy: user.uid,
        recordedByName: user.displayName,
        createdAt: serverTimestamp(),
        isEMIPayment: true,
        emiNumber: data.emiNumber,
        principalPortion: data.principalPortion,
        interestPortion: data.interestPortion,
        paymentReference: data.paymentReference ?? null,
      });

      // Create expense transaction
      const txnRef = doc(collection(this.firestore, 'transactions'));
      transaction.set(txnRef, {
        id: txnRef.id,
        type: 'expense',
        date: Timestamp.fromDate(data.date),
        amount: data.amount,
        category: 'loan-repayment',
        categoryName: 'Loan Repayment',
        segment: loan.segment,
        segmentName: loan.segmentName,
        description: `EMI #${data.emiNumber} - ${sourceName}`,
        paymentMethod: 'upi',
        paidBy: data.paidByUid ?? user.uid,
        paidByName: payer,
        createdBy: user.uid,
        createdByName: user.displayName,
        createdAt: serverTimestamp(),
        isDeleted: false,
        timeline: [{ action: 'created', by: user.uid, byName: user.displayName, at: Timestamp.now() }],
        expensePaymentStatus: 'paid',
        linkedLoanId: loanId,
        month,
        year,
      });

      // Update monthly summary
      const summaryRef = doc(this.firestore, 'monthlySummaries', `${month}-${loan.segment}`);
      const personKey = data.paidByUid ?? user.uid;
      transaction.set(summaryRef, {
        totalExpense: increment(data.amount),
        netProfit: increment(-data.amount),
        [`expenseByCategory.loan-repayment`]: increment(data.amount),
        [`expenseByPerson.${personKey}`]: increment(data.amount),
        month, year, segment: loan.segment, updatedAt: serverTimestamp(),
      }, { merge: true });

      // Update loan counters
      const newTotalRepaid = loan.totalRepaid + data.amount;
      const newBalance = loan.amount - newTotalRepaid;
      const newEmisPaid = (loan.emisPaid ?? 0) + 1;
      const allDone = newEmisPaid >= (loan.totalEMIs ?? 0);

      // Compute next payment due date
      const currentDue = loan.nextPaymentDueDate?.toDate() ?? data.date;
      const nextDue = new Date(currentDue);
      nextDue.setMonth(nextDue.getMonth() + 1);

      // For formal EMI loans, status is based on emisPaid vs totalEMIs (not totalRepaid vs amount)
      // because totalRepaid includes interest, which would cause premature 'completed' status
      const newStatus = allDone ? 'completed' : 'partial';

      const loanUpdates: Record<string, any> = {
        totalRepaid: newTotalRepaid,
        balanceRemaining: Math.max(0, newBalance),
        repaymentStatus: newStatus,
        totalInterestPaid: increment(data.interestPortion),
        totalPrincipalPaid: increment(data.principalPortion),
        outstandingBalance: increment(-data.principalPortion),
        emisPaid: newEmisPaid,
        nextPaymentDueDate: allDone ? null : Timestamp.fromDate(nextDue),
        nextPaymentNumber: allDone ? null : (loan.nextPaymentNumber ?? 1) + 1,
        timeline: arrayUnion({
          action: 'updated', by: user.uid, byName: user.displayName, at: Timestamp.now(),
          changes: `EMI #${data.emiNumber}: ₹${data.amount.toLocaleString('en-IN')} by ${payer}`,
        }),
      };
      if (allDone) {
        loanUpdates['loanClosureDate'] = Timestamp.fromDate(data.date);
        loanUpdates['closureReason'] = 'fully_paid';
      }
      transaction.update(loanRef, loanUpdates);
    });
  }

  // ==================== Interest-Only Payment ====================

  /** Record an interest-only payment. 2 reads, 4 writes */
  async addInterestPayment(
    loanId: string,
    amount: number,
    date: Date,
    paymentReference?: string,
    note?: string,
    paidByUid?: string,
    paidByName?: string,
  ): Promise<void> {
    const user = this.authService.userProfile()!;

    await runTransaction(this.firestore, async (transaction) => {
      const loanRef = doc(this.firestore, 'loans', loanId);
      const loanSnap = await transaction.get(loanRef);
      const loan = loanSnap.data() as Loan;

      if (loan.loanCategory !== 'formal' || loan.repaymentType !== 'interest_only') {
        throw new Error('Interest payments can only be made on interest-only loans');
      }

      const payer = paidByName ?? user.displayName;
      const month = getMonthString(date);
      const year = getYear(date);
      const sourceName = loan.loanSourceName ?? loan.personName;
      const paymentNum = (loan.totalInterestPaymentsMade ?? 0) + 1;

      // Create repayment doc
      const repRef = doc(collection(this.firestore, `loans/${loanId}/repayments`));
      transaction.set(repRef, {
        id: repRef.id,
        date: Timestamp.fromDate(date),
        amount,
        note: note ?? `Interest payment #${paymentNum}`,
        paidBy: paidByUid ?? user.uid,
        paidByName: payer,
        recordedBy: user.uid,
        recordedByName: user.displayName,
        createdAt: serverTimestamp(),
        interestPortion: amount,
        principalPortion: 0,
        paymentReference: paymentReference ?? null,
      });

      // Create expense transaction
      const txnRef = doc(collection(this.firestore, 'transactions'));
      transaction.set(txnRef, {
        id: txnRef.id,
        type: 'expense',
        date: Timestamp.fromDate(date),
        amount,
        category: 'loan-repayment',
        categoryName: 'Loan Repayment',
        segment: loan.segment,
        segmentName: loan.segmentName,
        description: `Interest payment #${paymentNum} - ${sourceName}`,
        paymentMethod: 'upi',
        paidBy: paidByUid ?? user.uid,
        paidByName: payer,
        createdBy: user.uid,
        createdByName: user.displayName,
        createdAt: serverTimestamp(),
        isDeleted: false,
        timeline: [{ action: 'created', by: user.uid, byName: user.displayName, at: Timestamp.now() }],
        expensePaymentStatus: 'paid',
        linkedLoanId: loanId,
        month,
        year,
      });

      // Update monthly summary
      const summaryRef = doc(this.firestore, 'monthlySummaries', `${month}-${loan.segment}`);
      transaction.set(summaryRef, {
        totalExpense: increment(amount),
        netProfit: increment(-amount),
        [`expenseByCategory.loan-repayment`]: increment(amount),
        [`expenseByPerson.${paidByUid ?? user.uid}`]: increment(amount),
        month, year, segment: loan.segment, updatedAt: serverTimestamp(),
      }, { merge: true });

      // Update loan — only interest counters, NOT totalRepaid/balanceRemaining
      const freq = loan.interestPaymentFrequency ?? 'monthly';
      const currentDue = loan.nextPaymentDueDate?.toDate() ?? date;
      const nextDue = new Date(currentDue);
      if (freq === 'weekly') nextDue.setDate(nextDue.getDate() + 7);
      else nextDue.setMonth(nextDue.getMonth() + 1);

      transaction.update(loanRef, {
        totalInterestPaid: increment(amount),
        totalInterestPaymentsMade: increment(1),
        nextPaymentDueDate: Timestamp.fromDate(nextDue),
        nextPaymentNumber: (loan.nextPaymentNumber ?? 1) + 1,
        timeline: arrayUnion({
          action: 'updated', by: user.uid, byName: user.displayName, at: Timestamp.now(),
          changes: `interest payment #${paymentNum}: ₹${amount.toLocaleString('en-IN')} by ${payer}`,
        }),
      });
    });
  }

  /** Close an interest-only loan by paying full principal. 2 reads, 4 writes */
  async closePrincipal(
    loanId: string,
    amount: number,
    date: Date,
    paymentReference?: string,
    note?: string,
  ): Promise<void> {
    const user = this.authService.userProfile()!;

    await runTransaction(this.firestore, async (transaction) => {
      const loanRef = doc(this.firestore, 'loans', loanId);
      const loanSnap = await transaction.get(loanRef);
      const loan = loanSnap.data() as Loan;

      if (loan.loanCategory !== 'formal' || loan.repaymentType !== 'interest_only') {
        throw new Error('Close principal is only for interest-only loans');
      }
      const outstanding = loan.outstandingBalance ?? loan.amount;
      if (amount < outstanding) {
        throw new Error(`Amount ₹${amount.toLocaleString('en-IN')} is less than outstanding ₹${outstanding.toLocaleString('en-IN')}`);
      }

      const month = getMonthString(date);
      const year = getYear(date);
      const sourceName = loan.loanSourceName ?? loan.personName;
      const excess = amount - outstanding;

      // Create repayment doc
      const repRef = doc(collection(this.firestore, `loans/${loanId}/repayments`));
      transaction.set(repRef, {
        id: repRef.id,
        date: Timestamp.fromDate(date),
        amount,
        note: note ?? `Principal closure - ${sourceName}`,
        paidBy: user.uid,
        paidByName: user.displayName,
        recordedBy: user.uid,
        recordedByName: user.displayName,
        createdAt: serverTimestamp(),
        principalPortion: outstanding,
        interestPortion: 0,
        isPreClosure: true,
        preClosureCharges: excess > 0 ? excess : null,
        paymentReference: paymentReference ?? null,
      });

      // Create expense transaction
      const txnRef = doc(collection(this.firestore, 'transactions'));
      transaction.set(txnRef, {
        id: txnRef.id,
        type: 'expense',
        date: Timestamp.fromDate(date),
        amount,
        category: 'loan-repayment',
        categoryName: 'Loan Repayment',
        segment: loan.segment,
        segmentName: loan.segmentName,
        description: `Principal closure - ${sourceName}`,
        paymentMethod: 'upi',
        paidBy: user.uid,
        paidByName: user.displayName,
        createdBy: user.uid,
        createdByName: user.displayName,
        createdAt: serverTimestamp(),
        isDeleted: false,
        timeline: [{ action: 'created', by: user.uid, byName: user.displayName, at: Timestamp.now() }],
        expensePaymentStatus: 'paid',
        linkedLoanId: loanId,
        month, year,
      });

      // Update monthly summary
      const summaryRef = doc(this.firestore, 'monthlySummaries', `${month}-${loan.segment}`);
      transaction.set(summaryRef, {
        totalExpense: increment(amount),
        netProfit: increment(-amount),
        [`expenseByCategory.loan-repayment`]: increment(amount),
        [`expenseByPerson.${user.uid}`]: increment(amount),
        month, year, segment: loan.segment, updatedAt: serverTimestamp(),
      }, { merge: true });

      // Update loan — close it
      transaction.update(loanRef, {
        totalRepaid: increment(amount),
        totalPrincipalPaid: increment(outstanding),
        balanceRemaining: 0,
        outstandingBalance: 0,
        repaymentStatus: 'completed',
        closureReason: 'fully_paid',
        loanClosureDate: Timestamp.fromDate(date),
        preClosureCharges: excess > 0 ? excess : null,
        nextPaymentDueDate: null,
        nextPaymentNumber: null,
        timeline: arrayUnion({
          action: 'updated', by: user.uid, byName: user.displayName, at: Timestamp.now(),
          changes: `principal closed: ₹${amount.toLocaleString('en-IN')}${excess > 0 ? ` (charges: ₹${excess.toLocaleString('en-IN')})` : ''}`,
        }),
      });
    });
  }

  // ==================== Part-Payment ====================

  /** Part-payment — extra lump sum to reduce principal. 2 reads, 4 writes */
  async addPartPayment(
    loanId: string,
    amount: number,
    date: Date,
    paymentReference?: string,
    note?: string,
  ): Promise<void> {
    const user = this.authService.userProfile()!;

    await runTransaction(this.firestore, async (transaction) => {
      const loanRef = doc(this.firestore, 'loans', loanId);
      const loanSnap = await transaction.get(loanRef);
      const loan = loanSnap.data() as Loan;

      if (loan.loanCategory !== 'formal') {
        throw new Error('Part-payments can only be made on formal loans');
      }
      const outstanding = loan.outstandingBalance ?? loan.amount;
      if (amount > outstanding) {
        throw new Error(`Amount ₹${amount.toLocaleString('en-IN')} exceeds outstanding ₹${outstanding.toLocaleString('en-IN')}`);
      }

      const month = getMonthString(date);
      const year = getYear(date);
      const sourceName = loan.loanSourceName ?? loan.personName;

      // Create repayment doc
      const repRef = doc(collection(this.firestore, `loans/${loanId}/repayments`));
      transaction.set(repRef, {
        id: repRef.id,
        date: Timestamp.fromDate(date),
        amount,
        note: note ?? `Part-payment - ${sourceName}`,
        paidBy: user.uid,
        paidByName: user.displayName,
        recordedBy: user.uid,
        recordedByName: user.displayName,
        createdAt: serverTimestamp(),
        isPartPayment: true,
        principalPortion: amount,
        interestPortion: 0,
        paymentReference: paymentReference ?? null,
      });

      // Create expense transaction
      const txnRef = doc(collection(this.firestore, 'transactions'));
      transaction.set(txnRef, {
        id: txnRef.id,
        type: 'expense',
        date: Timestamp.fromDate(date),
        amount,
        category: 'loan-repayment',
        categoryName: 'Loan Repayment',
        segment: loan.segment,
        segmentName: loan.segmentName,
        description: `Part-payment - ${sourceName}`,
        paymentMethod: 'upi',
        paidBy: user.uid,
        paidByName: user.displayName,
        createdBy: user.uid,
        createdByName: user.displayName,
        createdAt: serverTimestamp(),
        isDeleted: false,
        timeline: [{ action: 'created', by: user.uid, byName: user.displayName, at: Timestamp.now() }],
        expensePaymentStatus: 'paid',
        linkedLoanId: loanId,
        month, year,
      });

      // Update monthly summary
      const summaryRef = doc(this.firestore, 'monthlySummaries', `${month}-${loan.segment}`);
      transaction.set(summaryRef, {
        totalExpense: increment(amount),
        netProfit: increment(-amount),
        [`expenseByCategory.loan-repayment`]: increment(amount),
        [`expenseByPerson.${user.uid}`]: increment(amount),
        month, year, segment: loan.segment, updatedAt: serverTimestamp(),
      }, { merge: true });

      // Update loan — principal only, NOT emisPaid
      // For formal loans, use outstandingBalance for status (not amount-totalRepaid which includes interest)
      const newTotalRepaid = loan.totalRepaid + amount;
      const newBalance = loan.amount - newTotalRepaid;
      const newOutstanding = (loan.outstandingBalance ?? loan.amount) - amount;
      const isFormal = loan.loanCategory === 'formal';
      const newStatus = isFormal
        ? (newOutstanding <= 0 ? 'completed' : 'partial')
        : (newBalance <= 0 ? 'completed' : 'partial');
      transaction.update(loanRef, {
        totalRepaid: newTotalRepaid,
        balanceRemaining: Math.max(0, newBalance),
        repaymentStatus: newStatus,
        totalPrincipalPaid: increment(amount),
        outstandingBalance: increment(-amount),
        totalPartPayments: increment(amount),
        timeline: arrayUnion({
          action: 'updated', by: user.uid, byName: user.displayName, at: Timestamp.now(),
          changes: `part-payment: ₹${amount.toLocaleString('en-IN')} (principal reduced)`,
        }),
      });
    });
  }

  // ==================== Late Payment Penalty ====================

  /** Record a late penalty — does NOT touch totalRepaid/balanceRemaining. 2 reads, 4 writes */
  async addPenaltyPayment(
    loanId: string,
    penaltyAmount: number,
    forEMINumber: number,
    date: Date,
    paymentReference?: string,
    note?: string,
  ): Promise<void> {
    const user = this.authService.userProfile()!;

    await runTransaction(this.firestore, async (transaction) => {
      const loanRef = doc(this.firestore, 'loans', loanId);
      const loanSnap = await transaction.get(loanRef);
      const loan = loanSnap.data() as Loan;

      if (loan.loanCategory !== 'formal') {
        throw new Error('Penalty payments can only be made on formal loans');
      }

      const month = getMonthString(date);
      const year = getYear(date);
      const sourceName = loan.loanSourceName ?? loan.personName;

      // Create repayment doc
      const repRef = doc(collection(this.firestore, `loans/${loanId}/repayments`));
      transaction.set(repRef, {
        id: repRef.id,
        date: Timestamp.fromDate(date),
        amount: penaltyAmount,
        note: note ?? `Late penalty for EMI #${forEMINumber}`,
        paidBy: user.uid,
        paidByName: user.displayName,
        recordedBy: user.uid,
        recordedByName: user.displayName,
        createdAt: serverTimestamp(),
        penaltyAmount,
        emiNumber: forEMINumber,
        paymentReference: paymentReference ?? null,
      });

      // Create expense transaction
      const txnRef = doc(collection(this.firestore, 'transactions'));
      transaction.set(txnRef, {
        id: txnRef.id,
        type: 'expense',
        date: Timestamp.fromDate(date),
        amount: penaltyAmount,
        category: 'loan-repayment',
        categoryName: 'Loan Repayment',
        segment: loan.segment,
        segmentName: loan.segmentName,
        description: `Late penalty EMI #${forEMINumber} - ${sourceName}`,
        paymentMethod: 'upi',
        paidBy: user.uid,
        paidByName: user.displayName,
        createdBy: user.uid,
        createdByName: user.displayName,
        createdAt: serverTimestamp(),
        isDeleted: false,
        timeline: [{ action: 'created', by: user.uid, byName: user.displayName, at: Timestamp.now() }],
        expensePaymentStatus: 'paid',
        linkedLoanId: loanId,
        month, year,
      });

      // Update monthly summary
      const summaryRef = doc(this.firestore, 'monthlySummaries', `${month}-${loan.segment}`);
      transaction.set(summaryRef, {
        totalExpense: increment(penaltyAmount),
        netProfit: increment(-penaltyAmount),
        [`expenseByCategory.loan-repayment`]: increment(penaltyAmount),
        [`expenseByPerson.${user.uid}`]: increment(penaltyAmount),
        month, year, segment: loan.segment, updatedAt: serverTimestamp(),
      }, { merge: true });

      // Update loan — only penalty counter
      transaction.update(loanRef, {
        totalPenaltyPaid: increment(penaltyAmount),
        timeline: arrayUnion({
          action: 'updated', by: user.uid, byName: user.displayName, at: Timestamp.now(),
          changes: `late penalty EMI #${forEMINumber}: ₹${penaltyAmount.toLocaleString('en-IN')}`,
        }),
      });
    });
  }

  // ==================== Floating Rate Change ====================

  /** Update interest rate for floating-rate loans. 1 read, 1 write */
  async updateInterestRate(
    loanId: string,
    newRateInput: number,
    newFrequency: InterestFrequency,
    newEMI: number | undefined,
    effectiveDate: Date,
    note?: string,
  ): Promise<void> {
    const user = this.authService.userProfile()!;
    const newAnnualRate = toAnnualRate(newRateInput, newFrequency);

    await runTransaction(this.firestore, async (transaction) => {
      const loanRef = doc(this.firestore, 'loans', loanId);
      const loanSnap = await transaction.get(loanRef);
      const loan = loanSnap.data() as Loan;

      if (loan.loanCategory !== 'formal') {
        throw new Error('Rate changes can only be applied to formal loans');
      }

      const oldRate = loan.interestRate ?? 0;
      const rateChange = {
        id: `rc_${Date.now()}`,
        date: Timestamp.fromDate(effectiveDate),
        oldRate,
        newRate: newAnnualRate,
        newEMI: newEMI ?? null,
        note: note ?? null,
        recordedBy: user.uid,
        recordedByName: user.displayName,
      };

      const updates: Record<string, any> = {
        interestRate: newAnnualRate,
        interestRateInput: newRateInput,
        interestFrequency: newFrequency,
        rateChanges: arrayUnion(rateChange),
        timeline: arrayUnion({
          action: 'updated', by: user.uid, byName: user.displayName, at: Timestamp.now(),
          changes: `rate changed: ${oldRate}% p.a. → ${newAnnualRate}% p.a.`,
        }),
      };

      if (newEMI != null) {
        updates['emiAmount'] = newEMI;
      }

      // Recalculate interestAmountPerPeriod for interest-only loans
      if (loan.repaymentType === 'interest_only') {
        const freq = loan.interestPaymentFrequency ?? 'monthly';
        const outstanding = loan.outstandingBalance ?? loan.amount;
        const ratePerPeriod = freq === 'weekly'
          ? newAnnualRate / 52 / 100
          : newAnnualRate / 12 / 100;
        updates['interestAmountPerPeriod'] = Math.round(outstanding * ratePerPeriod * 100) / 100;
      }

      transaction.update(loanRef, updates);
    });
  }

  // ==================== Pre-Closure ====================

  /** Pre-close a formal loan. 2 reads, 4 writes */
  async preCloseLoan(
    loanId: string,
    amount: number,
    charges: number,
    date: Date,
    paymentReference?: string,
    note?: string,
  ): Promise<void> {
    const user = this.authService.userProfile()!;

    await runTransaction(this.firestore, async (transaction) => {
      const loanRef = doc(this.firestore, 'loans', loanId);
      const loanSnap = await transaction.get(loanRef);
      const loan = loanSnap.data() as Loan;

      if (loan.loanCategory !== 'formal') {
        throw new Error('Pre-closure is only for formal loans');
      }

      const totalPayment = amount + charges;
      const month = getMonthString(date);
      const year = getYear(date);
      const sourceName = loan.loanSourceName ?? loan.personName;

      // Create repayment doc
      const repRef = doc(collection(this.firestore, `loans/${loanId}/repayments`));
      transaction.set(repRef, {
        id: repRef.id,
        date: Timestamp.fromDate(date),
        amount: totalPayment,
        note: note ?? `Pre-closure - ${sourceName}`,
        paidBy: user.uid,
        paidByName: user.displayName,
        recordedBy: user.uid,
        recordedByName: user.displayName,
        createdAt: serverTimestamp(),
        isPreClosure: true,
        preClosureCharges: charges,
        principalPortion: amount,
        interestPortion: 0,
        paymentReference: paymentReference ?? null,
      });

      // Create expense transaction
      const txnRef = doc(collection(this.firestore, 'transactions'));
      transaction.set(txnRef, {
        id: txnRef.id,
        type: 'expense',
        date: Timestamp.fromDate(date),
        amount: totalPayment,
        category: 'loan-repayment',
        categoryName: 'Loan Repayment',
        segment: loan.segment,
        segmentName: loan.segmentName,
        description: `Pre-closure - ${sourceName}${charges > 0 ? ` (charges: ₹${charges.toLocaleString('en-IN')})` : ''}`,
        paymentMethod: 'upi',
        paidBy: user.uid,
        paidByName: user.displayName,
        createdBy: user.uid,
        createdByName: user.displayName,
        createdAt: serverTimestamp(),
        isDeleted: false,
        timeline: [{ action: 'created', by: user.uid, byName: user.displayName, at: Timestamp.now() }],
        expensePaymentStatus: 'paid',
        linkedLoanId: loanId,
        month, year,
      });

      // Update monthly summary
      const summaryRef = doc(this.firestore, 'monthlySummaries', `${month}-${loan.segment}`);
      transaction.set(summaryRef, {
        totalExpense: increment(totalPayment),
        netProfit: increment(-totalPayment),
        [`expenseByCategory.loan-repayment`]: increment(totalPayment),
        [`expenseByPerson.${user.uid}`]: increment(totalPayment),
        month, year, segment: loan.segment, updatedAt: serverTimestamp(),
      }, { merge: true });

      // Close loan
      transaction.update(loanRef, {
        totalRepaid: increment(totalPayment),
        totalPrincipalPaid: increment(amount),
        balanceRemaining: 0,
        outstandingBalance: 0,
        repaymentStatus: 'completed',
        closureReason: 'pre_closed',
        loanClosureDate: Timestamp.fromDate(date),
        preClosureCharges: charges,
        nextPaymentDueDate: null,
        nextPaymentNumber: null,
        timeline: arrayUnion({
          action: 'updated', by: user.uid, byName: user.displayName, at: Timestamp.now(),
          changes: `pre-closed: ₹${totalPayment.toLocaleString('en-IN')}${charges > 0 ? ` (charges: ₹${charges.toLocaleString('en-IN')})` : ''}`,
        }),
      });
    });
  }

  // ==================== Balance Transfer ====================

  /** Balance transfer — pre-close old loan + create new. 2 reads, 5 writes */
  async balanceTransfer(oldLoanId: string, newLoanData: LoanFormData): Promise<string> {
    const user = this.authService.userProfile()!;
    let newLoanId = '';

    await runTransaction(this.firestore, async (transaction) => {
      // Read old loan
      const oldLoanRef = doc(this.firestore, 'loans', oldLoanId);
      const oldLoanSnap = await transaction.get(oldLoanRef);
      const oldLoan = oldLoanSnap.data() as Loan;

      if (oldLoan.loanCategory !== 'formal') {
        throw new Error('Balance transfer is only for formal loans');
      }

      const outstanding = oldLoan.outstandingBalance ?? oldLoan.balanceRemaining;
      const date = newLoanData.disbursementDate ?? newLoanData.date;
      const month = getMonthString(date);
      const year = getYear(date);
      const oldSourceName = oldLoan.loanSourceName ?? oldLoan.personName;

      // Pre-close old loan repayment doc
      const repRef = doc(collection(this.firestore, `loans/${oldLoanId}/repayments`));
      transaction.set(repRef, {
        id: repRef.id,
        date: Timestamp.fromDate(date),
        amount: outstanding,
        note: `Balance transfer to ${newLoanData.loanSourceName ?? 'new lender'}`,
        paidBy: user.uid,
        paidByName: user.displayName,
        recordedBy: user.uid,
        recordedByName: user.displayName,
        createdAt: serverTimestamp(),
        isPreClosure: true,
        principalPortion: outstanding,
        interestPortion: 0,
      });

      // Create expense transaction for old loan closure
      const txnRef = doc(collection(this.firestore, 'transactions'));
      transaction.set(txnRef, {
        id: txnRef.id,
        type: 'expense',
        date: Timestamp.fromDate(date),
        amount: outstanding,
        category: 'loan-repayment',
        categoryName: 'Loan Repayment',
        segment: oldLoan.segment,
        segmentName: oldLoan.segmentName,
        description: `Balance transfer closure - ${oldSourceName}`,
        paymentMethod: 'upi',
        paidBy: user.uid,
        paidByName: user.displayName,
        createdBy: user.uid,
        createdByName: user.displayName,
        createdAt: serverTimestamp(),
        isDeleted: false,
        timeline: [{ action: 'created', by: user.uid, byName: user.displayName, at: Timestamp.now() }],
        expensePaymentStatus: 'paid',
        linkedLoanId: oldLoanId,
        month, year,
      });

      // Update monthly summary
      const summaryRef = doc(this.firestore, 'monthlySummaries', `${month}-${oldLoan.segment}`);
      transaction.set(summaryRef, {
        totalExpense: increment(outstanding),
        netProfit: increment(-outstanding),
        [`expenseByCategory.loan-repayment`]: increment(outstanding),
        [`expenseByPerson.${user.uid}`]: increment(outstanding),
        month, year, segment: oldLoan.segment, updatedAt: serverTimestamp(),
      }, { merge: true });

      // Create new formal loan doc
      const newLoanRef = doc(collection(this.firestore, 'loans'));
      newLoanId = newLoanRef.id;

      // Build new loan using createFormalLoan logic (inline to stay in same transaction)
      const newSanctioned = newLoanData.sanctionedAmount ?? newLoanData.amount;
      const newDeductions = (newLoanData.deductions ?? []).map((d, i) => ({
        ...d, id: `ded_${Date.now()}_${i}`,
        date: Timestamp.fromDate(d.date instanceof Date ? d.date : new Date(d.date as any)),
      }));
      const financedDed = newDeductions.filter((d: any) => d.isFinanced).reduce((s: number, d: any) => s + d.amount, 0);
      const newNetDisbursed = newSanctioned - financedDed;
      const newAnnualRate = newLoanData.interestRate ?? toAnnualRate(newLoanData.interestRateInput ?? 0, newLoanData.interestFrequency ?? 'annual');
      const newTenure = newLoanData.tenure ?? 0;
      const newMoratorium = newLoanData.moratoriumMonths ?? 0;

      let newEmiAmount = newLoanData.emiAmount;
      if (newLoanData.repaymentType === 'emi' && newTenure > 0 && !newEmiAmount) {
        const r = annualToMonthlyDecimal(newLoanData.isSubsidized ? (newLoanData.effectiveRate ?? newAnnualRate) : newAnnualRate);
        if (r > 0) {
          const rPowN = Math.pow(1 + r, newTenure);
          newEmiAmount = Math.round((newSanctioned * r * rPowN / (rPowN - 1)) * 100) / 100;
        } else {
          newEmiAmount = Math.round((newSanctioned / newTenure) * 100) / 100;
        }
      }

      const startDate = newLoanData.disbursementDate ?? newLoanData.date;
      const nextDue = new Date(startDate);
      if (newLoanData.repaymentType === 'interest_only') {
        const freq = newLoanData.interestPaymentFrequency ?? 'monthly';
        if (freq === 'weekly') nextDue.setDate(nextDue.getDate() + 7);
        else nextDue.setMonth(nextDue.getMonth() + 1);
      } else {
        nextDue.setMonth(nextDue.getMonth() + newMoratorium + 1);
      }

      transaction.set(newLoanRef, {
        id: newLoanRef.id,
        date: Timestamp.fromDate(newLoanData.date),
        amount: newSanctioned,
        type: newLoanData.type,
        personName: newLoanData.personName,
        purpose: newLoanData.purpose || `Balance transfer from ${oldSourceName}`,
        segment: newLoanData.segment,
        segmentName: newLoanData.segmentName,
        repaymentStatus: 'pending',
        totalRepaid: 0,
        balanceRemaining: newSanctioned,
        recordedBy: user.uid,
        recordedByName: user.displayName,
        createdAt: serverTimestamp(),
        isDeleted: false,
        timeline: [{
          action: 'created', by: user.uid, byName: user.displayName, at: Timestamp.now(),
          changes: `balance transfer from ${oldSourceName}`,
        }],
        month: getMonthString(newLoanData.date),
        year: getYear(newLoanData.date),
        loanCategory: 'formal',
        loanSource: newLoanData.loanSource,
        loanSourceName: newLoanData.loanSourceName,
        accountNumber: newLoanData.accountNumber ?? null,
        sanctionedAmount: newSanctioned,
        netDisbursedAmount: newNetDisbursed,
        totalDeductions: newDeductions.reduce((s: number, d: any) => s + d.amount, 0),
        deductions: newDeductions.length > 0 ? newDeductions : null,
        disbursementDate: Timestamp.fromDate(startDate),
        repaymentType: newLoanData.repaymentType ?? 'emi',
        interestType: newLoanData.interestType ?? 'fixed',
        interestFrequency: newLoanData.interestFrequency ?? 'annual',
        interestRateInput: newLoanData.interestRateInput ?? null,
        interestRate: newAnnualRate,
        tenure: newTenure || null,
        emiAmount: newEmiAmount ?? null,
        totalEMIs: newLoanData.totalEMIs ?? (newTenure || null),
        emisPaid: 0,
        moratoriumMonths: newMoratorium,
        totalInterestPaid: 0,
        totalPrincipalPaid: 0,
        outstandingBalance: newSanctioned,
        totalPartPayments: 0,
        totalPenaltyPaid: 0,
        nextPaymentDueDate: Timestamp.fromDate(nextDue),
        nextPaymentNumber: 1,
        replacesLoanId: oldLoanId,
        isBalanceTransfer: true,
        utilizationTotal: 0,
        utilizationRemaining: newNetDisbursed,
        heldByUid: newLoanData.heldByUid ?? oldLoan.heldByUid ?? null,
        heldByName: newLoanData.heldByName ?? oldLoan.heldByName ?? null,
        segments: newLoanData.segments ?? [newLoanData.segment],
        segmentNames: newLoanData.segmentNames ?? [newLoanData.segmentName],
        isSubsidized: newLoanData.isSubsidized ?? false,
        subsidyDetails: newLoanData.subsidyDetails ?? null,
        effectiveRate: newLoanData.effectiveRate ?? null,
      });

      // Close old loan
      transaction.update(oldLoanRef, {
        totalRepaid: increment(outstanding),
        totalPrincipalPaid: increment(outstanding),
        balanceRemaining: 0,
        outstandingBalance: 0,
        repaymentStatus: 'completed',
        closureReason: 'balance_transfer',
        loanClosureDate: Timestamp.fromDate(date),
        replacedByLoanId: newLoanId,
        nextPaymentDueDate: null,
        nextPaymentNumber: null,
        timeline: arrayUnion({
          action: 'updated', by: user.uid, byName: user.displayName, at: Timestamp.now(),
          changes: `balance transferred to ${newLoanData.loanSourceName ?? 'new lender'}`,
        }),
      });
    });

    return newLoanId;
  }

  // ==================== Collateral & Document Management ====================

  /** Add collateral item. 1 read, 1 write */
  async addCollateral(loanId: string, item: Omit<CollateralItem, 'id'>): Promise<void> {
    const user = this.authService.userProfile()!;
    await runTransaction(this.firestore, async (transaction) => {
      const loanRef = doc(this.firestore, 'loans', loanId);
      const loanSnap = await transaction.get(loanRef);
      const loan = loanSnap.data() as Loan;
      const newItem: CollateralItem = { ...item, id: `col_${Date.now()}` } as CollateralItem;
      const updated = [...(loan.collaterals ?? []), newItem];
      transaction.update(loanRef, {
        collaterals: updated,
        totalCollateralValue: updated.reduce((s, c) => s + c.estimatedValue, 0),
        timeline: arrayUnion({
          action: 'updated', by: user.uid, byName: user.displayName, at: Timestamp.now(),
          changes: `collateral added: ${item.description} (₹${item.estimatedValue.toLocaleString('en-IN')})`,
        }),
      });
    });
  }

  /** Remove collateral item. 1 read, 1 write */
  async removeCollateral(loanId: string, itemId: string): Promise<void> {
    const user = this.authService.userProfile()!;
    await runTransaction(this.firestore, async (transaction) => {
      const loanRef = doc(this.firestore, 'loans', loanId);
      const loanSnap = await transaction.get(loanRef);
      const loan = loanSnap.data() as Loan;
      const removed = (loan.collaterals ?? []).find(c => c.id === itemId);
      if (!removed) throw new Error('Collateral not found');
      const updated = (loan.collaterals ?? []).filter(c => c.id !== itemId);
      transaction.update(loanRef, {
        collaterals: updated.length > 0 ? updated : null,
        totalCollateralValue: updated.reduce((s, c) => s + c.estimatedValue, 0) || null,
        timeline: arrayUnion({
          action: 'updated', by: user.uid, byName: user.displayName, at: Timestamp.now(),
          changes: `collateral removed: ${removed.description}`,
        }),
      });
    });
  }

  /** Release collateral (mark as returned). 1 read, 1 write */
  async releaseCollateral(loanId: string, itemId: string, releasedDate: Date): Promise<void> {
    const user = this.authService.userProfile()!;
    await runTransaction(this.firestore, async (transaction) => {
      const loanRef = doc(this.firestore, 'loans', loanId);
      const loanSnap = await transaction.get(loanRef);
      const loan = loanSnap.data() as Loan;
      const updated = (loan.collaterals ?? []).map(c =>
        c.id === itemId ? { ...c, isReleased: true, releasedDate: Timestamp.fromDate(releasedDate) } : c
      );
      transaction.update(loanRef, {
        collaterals: updated,
        timeline: arrayUnion({
          action: 'updated', by: user.uid, byName: user.displayName, at: Timestamp.now(),
          changes: `collateral released: ${(loan.collaterals ?? []).find(c => c.id === itemId)?.description ?? itemId}`,
        }),
      });
    });
  }

  /** Add loan document reference. 1 read, 1 write */
  async addLoanDocument(loanId: string, loanDoc: Omit<LoanDocument, 'id'>): Promise<void> {
    const user = this.authService.userProfile()!;
    await runTransaction(this.firestore, async (transaction) => {
      const loanRef = doc(this.firestore, 'loans', loanId);
      const loanSnap = await transaction.get(loanRef);
      const loan = loanSnap.data() as Loan;
      const newDoc: LoanDocument = { ...loanDoc, id: `doc_${Date.now()}` } as LoanDocument;
      transaction.update(loanRef, {
        documents: [...(loan.documents ?? []), newDoc],
        timeline: arrayUnion({
          action: 'updated', by: user.uid, byName: user.displayName, at: Timestamp.now(),
          changes: `document added: ${loanDoc.type}${loanDoc.referenceNumber ? ` (${loanDoc.referenceNumber})` : ''}`,
        }),
      });
    });
  }

  /** Remove loan document reference. 1 read, 1 write */
  async removeLoanDocument(loanId: string, docId: string): Promise<void> {
    const user = this.authService.userProfile()!;
    await runTransaction(this.firestore, async (transaction) => {
      const loanRef = doc(this.firestore, 'loans', loanId);
      const loanSnap = await transaction.get(loanRef);
      const loan = loanSnap.data() as Loan;
      const updated = (loan.documents ?? []).filter(d => d.id !== docId);
      transaction.update(loanRef, {
        documents: updated.length > 0 ? updated : null,
        timeline: arrayUnion({
          action: 'updated', by: user.uid, byName: user.displayName, at: Timestamp.now(),
          changes: `document removed`,
        }),
      });
    });
  }

  // ==================== Gold Loan ====================

  /** Get margin status for a gold loan (pure computation, no Firestore) */
  getGoldLoanMarginStatus(loan: Loan, currentGoldRatePerGram: number): {
    currentGoldValue: number; currentLtv: number; maxLtv: number;
    isMarginBreached: boolean; headroom: number;
  } {
    const goldItems = (loan.collaterals ?? []).filter(c => c.type === 'gold' && !c.isReleased);
    const currentGoldValue = goldItems.reduce((sum, c) => {
      const nw = c.netWeight ?? c.grossWeight ?? c.weight ?? 0;
      return sum + computeGoldValue(nw, c.purity ?? '22K', currentGoldRatePerGram);
    }, 0);
    const outstanding = loan.outstandingBalance ?? loan.balanceRemaining;
    const maxLtv = loan.ltvRatio ?? rbiLtvRatio(currentGoldValue);
    const currentLtv = currentGoldValue > 0 ? outstanding / currentGoldValue : 0;
    return {
      currentGoldValue,
      currentLtv,
      maxLtv,
      isMarginBreached: currentLtv > maxLtv,
      headroom: Math.max(0, Math.round(currentGoldValue * maxLtv - outstanding)),
    };
  }

  /** Renew gold loan — close old, create new at current gold rate. 2 reads, 3 writes */
  async renewGoldLoan(
    oldLoanId: string,
    newGoldRatePerGram: number,
    newLtvRatio?: number,
    newInterestRate?: number,
    note?: string,
  ): Promise<string> {
    const user = this.authService.userProfile()!;
    let newLoanId = '';

    await runTransaction(this.firestore, async (transaction) => {
      const oldLoanRef = doc(this.firestore, 'loans', oldLoanId);
      const oldLoanSnap = await transaction.get(oldLoanRef);
      const oldLoan = oldLoanSnap.data() as Loan;

      if (oldLoan.loanSource !== 'gold_loan') throw new Error('Renewal is only for gold loans');

      // Clone collateral items at new gold rate
      const newCollaterals = (oldLoan.collaterals ?? []).map(c => {
        if (c.type !== 'gold') return { ...c };
        const nw = c.netWeight ?? c.grossWeight ?? c.weight ?? 0;
        const newGoldValue = computeGoldValue(nw, c.purity ?? '22K', newGoldRatePerGram);
        return { ...c, goldRatePerGram: newGoldRatePerGram, goldValue: newGoldValue, estimatedValue: newGoldValue, isReleased: false, releasedDate: null };
      });

      const goldAgg = computeGoldAggregates(newCollaterals);
      const ltv = newLtvRatio ?? oldLoan.ltvRatio ?? rbiLtvRatio(goldAgg.totalGoldValue);
      const eligibleAmount = Math.round(goldAgg.totalGoldValue * ltv);
      const annualRate = newInterestRate ?? oldLoan.interestRate ?? 0;

      // Create new loan
      const newLoanRef = doc(collection(this.firestore, 'loans'));
      newLoanId = newLoanRef.id;
      const now = new Date();
      const month = getMonthString(now);

      transaction.set(newLoanRef, {
        id: newLoanRef.id,
        date: Timestamp.fromDate(now),
        amount: eligibleAmount,
        type: oldLoan.type,
        personName: oldLoan.personName,
        purpose: note || `Gold loan renewal from ${oldLoan.loanSourceName ?? 'previous loan'}`,
        segment: oldLoan.segment,
        segmentName: oldLoan.segmentName,
        repaymentStatus: 'pending',
        totalRepaid: 0,
        balanceRemaining: eligibleAmount,
        recordedBy: user.uid,
        recordedByName: user.displayName,
        createdAt: serverTimestamp(),
        isDeleted: false,
        timeline: [{ action: 'created', by: user.uid, byName: user.displayName, at: Timestamp.now(),
          changes: `gold loan renewed at ₹${newGoldRatePerGram.toLocaleString('en-IN')}/g` }],
        month, year: now.getFullYear(),
        loanCategory: 'formal',
        loanSource: 'gold_loan',
        loanSourceName: oldLoan.loanSourceName,
        accountNumber: oldLoan.accountNumber,
        sanctionedAmount: eligibleAmount,
        netDisbursedAmount: eligibleAmount,
        totalDeductions: 0,
        repaymentType: oldLoan.repaymentType ?? 'interest_only',
        interestType: oldLoan.interestType ?? 'fixed',
        interestFrequency: oldLoan.interestFrequency ?? 'monthly',
        interestRateInput: oldLoan.interestRateInput,
        interestRate: annualRate,
        interestPaymentFrequency: oldLoan.interestPaymentFrequency ?? 'monthly',
        interestAmountPerPeriod: oldLoan.repaymentType === 'interest_only'
          ? Math.round(eligibleAmount * (annualRate / 12 / 100) * 100) / 100 : null,
        totalInterestPaid: 0, totalPrincipalPaid: 0, outstandingBalance: eligibleAmount,
        totalPartPayments: 0, totalPenaltyPaid: 0,
        nextPaymentDueDate: Timestamp.fromDate(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)),
        nextPaymentNumber: 1,
        collaterals: newCollaterals,
        totalCollateralValue: newCollaterals.reduce((s: number, c: any) => s + c.estimatedValue, 0),
        pledgeReceiptNumber: oldLoan.pledgeReceiptNumber,
        ltvRatio: ltv,
        totalGoldWeight: goldAgg.totalGoldWeight,
        totalGoldValue: goldAgg.totalGoldValue,
        eligibleLoanAmount: eligibleAmount,
        renewedFromLoanId: oldLoanId,
        isRenewal: true,
        utilizationTotal: 0, utilizationRemaining: eligibleAmount,
        heldByUid: oldLoan.heldByUid ?? null, heldByName: oldLoan.heldByName ?? null,
        segments: oldLoan.segments ?? [oldLoan.segment],
        segmentNames: oldLoan.segmentNames ?? [oldLoan.segmentName],
        isSubsidized: oldLoan.isSubsidized ?? false,
        subsidyDetails: oldLoan.subsidyDetails ?? null,
        effectiveRate: oldLoan.effectiveRate ?? null,
      });

      // Close old loan
      transaction.update(oldLoanRef, {
        repaymentStatus: 'completed',
        closureReason: 'renewed',
        loanClosureDate: Timestamp.fromDate(now),
        renewedByLoanId: newLoanId,
        nextPaymentDueDate: null, nextPaymentNumber: null,
        timeline: arrayUnion({
          action: 'updated', by: user.uid, byName: user.displayName, at: Timestamp.now(),
          changes: `renewed — gold revalued at ₹${newGoldRatePerGram.toLocaleString('en-IN')}/g → new loan ₹${eligibleAmount.toLocaleString('en-IN')}`,
        }),
      });
    });

    return newLoanId;
  }

  /** Top-up gold loan — increase amount based on current gold value headroom. 1 read, 1 write */
  async topUpGoldLoan(
    loanId: string,
    currentGoldRatePerGram: number,
    additionalAmount: number,
    note?: string,
  ): Promise<void> {
    const user = this.authService.userProfile()!;

    await runTransaction(this.firestore, async (transaction) => {
      const loanRef = doc(this.firestore, 'loans', loanId);
      const loanSnap = await transaction.get(loanRef);
      const loan = loanSnap.data() as Loan;

      if (loan.loanSource !== 'gold_loan') throw new Error('Top-up is only for gold loans');

      // Revalue gold at current rate
      const goldItems = (loan.collaterals ?? []).filter(c => c.type === 'gold' && !c.isReleased);
      const currentGoldValue = goldItems.reduce((sum, c) => {
        const nw = c.netWeight ?? c.grossWeight ?? c.weight ?? 0;
        return sum + computeGoldValue(nw, c.purity ?? '22K', currentGoldRatePerGram);
      }, 0);

      const maxLtv = loan.ltvRatio ?? rbiLtvRatio(currentGoldValue);
      const outstanding = loan.outstandingBalance ?? loan.balanceRemaining;
      const headroom = Math.round(currentGoldValue * maxLtv - outstanding);

      if (additionalAmount > headroom) {
        throw new Error(`Top-up ₹${additionalAmount.toLocaleString('en-IN')} exceeds headroom ₹${headroom.toLocaleString('en-IN')}`);
      }

      transaction.update(loanRef, {
        sanctionedAmount: increment(additionalAmount),
        amount: increment(additionalAmount),
        outstandingBalance: increment(additionalAmount),
        balanceRemaining: increment(additionalAmount),
        netDisbursedAmount: increment(additionalAmount),
        utilizationRemaining: increment(additionalAmount),
        totalGoldValue: currentGoldValue,
        eligibleLoanAmount: Math.round(currentGoldValue * maxLtv),
        timeline: arrayUnion({
          action: 'updated', by: user.uid, byName: user.displayName, at: Timestamp.now(),
          changes: `gold loan top-up: +₹${additionalAmount.toLocaleString('en-IN')} (gold rate ₹${currentGoldRatePerGram.toLocaleString('en-IN')}/g, headroom ₹${headroom.toLocaleString('en-IN')})`,
        }),
      });
    });
  }

  // ==================== Querying ====================

  /** Get all transactions linked to a loan */
  async getLinkedTransactions(loanId: string): Promise<any[]> {
    const q = query(
      collection(this.firestore, 'transactions'),
      where('linkedLoanId', '==', loanId),
      where('isDeleted', '==', false),
      orderBy('date', 'desc'),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => d.data());
  }

  /** Get all simple loans linked to a formal loan (personal withdrawals) */
  async getLinkedSimpleLoans(loanId: string): Promise<Loan[]> {
    const q = query(
      collection(this.firestore, 'loans'),
      where('parentFormalLoanId', '==', loanId),
      where('isDeleted', '==', false),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => d.data() as Loan);
  }
}
