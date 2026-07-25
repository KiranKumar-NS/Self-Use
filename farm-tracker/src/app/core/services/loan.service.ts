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
  LoanDeduction, CollateralItem, LoanDocument, LoanAdvance,
} from '../models/loan.model';
import { AuthService } from './auth.service';
import { SummaryService } from './summary.service';
import { LoanPaymentsService } from './loan-payments.service';
import { getMonthString, getYear } from '../utils/date.utils';
import { appendTimelineCapped } from '../utils/timeline.utils';

// Pure computation helpers live in loan-math.ts (no Firestore, directly unit-testable)
import {
  purityFactor,
  computeGoldValue,
  rbiLtvRatio,
  computeGoldAggregates,
  toAnnualRate,
  annualToMonthlyDecimal,
  generateEMISchedule,
  buildLiveEMISchedule,
} from './loan-math';

export type { LiveEMIEntry } from './loan-math';

// --- Service class ---

@Injectable({ providedIn: 'root' })
export class LoanService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private summaryService = inject(SummaryService);
  private payments = inject(LoanPaymentsService);

  private summaryCache: { data: any; time: number } | null = null;
  private readonly SUMMARY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes (invalidated on loan writes)

  clearSummaryCache(): void {
    this.summaryCache = null;
  }

  /** Loan writes invalidate both the loan summary cache and the dashboard summary cache */
  private invalidateCaches(): void {
    this.clearSummaryCache();
    this.summaryService.clearCache();
  }

  // Expose pure functions as service methods
  generateEMISchedule = generateEMISchedule;
  buildLiveEMISchedule = buildLiveEMISchedule;
  toAnnualRate = toAnnualRate;
  purityFactor = purityFactor;
  computeGoldValue = computeGoldValue;
  rbiLtvRatio = rbiLtvRatio;
  computeGoldAggregates = computeGoldAggregates;

  async create(data: LoanFormData): Promise<string> {
    const user = this.authService.requireUser();
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
    const user = this.authService.requireUser();
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
    const user = this.authService.requireUser();

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
        timeline: appendTimelineCapped(loan.timeline, {
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
    const user = this.authService.requireUser();
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
    const user = this.authService.requireUser();
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
    let loans = snapshot.docs.map((d) => d.data() as Loan);
    if (this.authService.isSegmentRestricted()) {
      loans = loans.filter((l) => this.canViewLoan(l));
    }
    const last = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;

    return { loans, lastDoc: last };
  }

  /** Formal loans can span multiple segments; visible if any of them is viewable. */
  private canViewLoan(loan: Loan): boolean {
    return this.authService.canViewSegment(loan.segment)
      || (loan.segments ?? []).some((id) => this.authService.canViewSegment(id));
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
    unusedInHand: number;
  }> {
    // Restricted viewers bypass the cache: the cached aggregate is unfiltered
    const restricted = this.authService.isSegmentRestricted();
    if (!restricted && this.summaryCache && Date.now() - this.summaryCache.time < this.SUMMARY_CACHE_TTL) {
      return this.summaryCache.data;
    }

    const q = query(
      collection(this.firestore, 'loans'),
      where('isDeleted', '==', false),
      limit(500)
    );
    const snapshot = await getDocs(q);
    let loans = snapshot.docs.map((d) => d.data() as Loan);
    if (restricted) loans = loans.filter((l) => this.canViewLoan(l));

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

    const result = {
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
      // Loan money received but not yet spent/allocated — cash in hand from active formal loans
      unusedInHand: activeFormal.reduce((sum, l) => sum + (l.utilizationRemaining ?? 0), 0),
    };
    if (!restricted) this.summaryCache = { data: result, time: Date.now() };
    return result;
  }

  // ==================== Formal Loan Methods ====================

  /** Create a formal loan — 1 write, 0 reads */
  async createFormalLoan(data: LoanFormData): Promise<string> {
    const user = this.authService.requireUser();
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
    const user = this.authService.requireUser();

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
    const user = this.authService.requireUser();
    let txnId = '';

    await runTransaction(this.firestore, async (transaction) => {
      // Read loan
      const loanRef = doc(this.firestore, 'loans', loanId);
      const loanSnap = await transaction.get(loanRef);
      const loan = loanSnap.data() as Loan;

      if (loan.loanCategory !== 'formal') {
        throw new Error('Utilization can only be added to formal loans');
      }
      // Only the holder's own in-hand pool is spendable directly — funds advanced out to
      // other people to hold are excluded (they're spent via settleAdvance, not here).
      const advancedOut = (loan.advances ?? []).filter(a => a.status === 'open')
        .reduce((s, a) => s + (a.amount - a.spent - a.returned), 0);
      const remaining = (loan.utilizationRemaining ?? 0) - advancedOut;
      if (data.amount > remaining) {
        throw new Error(`Amount ₹${data.amount.toLocaleString('en-IN')} exceeds in-hand funds ₹${remaining.toLocaleString('en-IN')}`);
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
        [`expenseByCategoryId.${data.category}`]: increment(data.amount),
        [`expenseByPerson.${personKey}`]: increment(data.amount),
        month,
        year,
        segment: data.segment,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // Update yearly summary
      const yearlySummaryRef = doc(this.firestore, 'yearlySummaries', `${year}-${data.segment}`);
      transaction.set(yearlySummaryRef, {
        totalExpense: increment(data.amount),
        netProfit: increment(-data.amount),
        [`expenseByCategory.${data.category}`]: increment(data.amount),
        [`expenseByCategoryId.${data.category}`]: increment(data.amount),
        [`expenseByPerson.${personKey}`]: increment(data.amount),
        year, segment: data.segment, updatedAt: serverTimestamp(),
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
    const user = this.authService.requireUser();
    let simpleLoanId = '';

    await runTransaction(this.firestore, async (transaction) => {
      // Read formal loan
      const loanRef = doc(this.firestore, 'loans', loanId);
      const loanSnap = await transaction.get(loanRef);
      const loan = loanSnap.data() as Loan;

      if (loan.loanCategory !== 'formal') {
        throw new Error('Personal utilization can only be added to formal loans');
      }
      // Exclude funds advanced out to others (they're not in the holder's pool)
      const advancedOut = (loan.advances ?? []).filter(a => a.status === 'open')
        .reduce((s, a) => s + (a.amount - a.spent - a.returned), 0);
      const remaining = (loan.utilizationRemaining ?? 0) - advancedOut;
      if (amount > remaining) {
        throw new Error(`Amount ₹${amount.toLocaleString('en-IN')} exceeds in-hand funds ₹${remaining.toLocaleString('en-IN')}`);
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

  /** Advance loan cash to a person to hold for business use (float / imprest). 1 read, 1 write.
   *  Custody only — reduces the holder's in-hand share, does NOT consume loan funds (nothing spent yet). */
  async advanceToPerson(
    loanId: string,
    personUid: string | undefined,
    personName: string,
    amount: number,
    date: Date,
    note?: string,
  ): Promise<void> {
    const user = this.authService.requireUser();
    if (amount <= 0) throw new Error('Amount must be greater than 0');

    await runTransaction(this.firestore, async (transaction) => {
      const loanRef = doc(this.firestore, 'loans', loanId);
      const loanSnap = await transaction.get(loanRef);
      const loan = loanSnap.data() as Loan;

      if (loan.loanCategory !== 'formal') {
        throw new Error('Advances can only be given from formal loans');
      }

      // Holder can only advance the unused funds they still hold (not already advanced out)
      const openAdvances = (loan.advances ?? []).filter(a => a.status === 'open');
      const advancedOut = openAdvances.reduce((s, a) => s + (a.amount - a.spent - a.returned), 0);
      const holderAvailable = (loan.utilizationRemaining ?? 0) - advancedOut;
      if (amount > holderAvailable) {
        throw new Error(`Advance ₹${amount.toLocaleString('en-IN')} exceeds unused funds in hand ₹${holderAvailable.toLocaleString('en-IN')}`);
      }

      const advance: LoanAdvance = {
        id: `adv_${Date.now()}`,
        personName,
        amount,
        spent: 0,
        returned: 0,
        date: Timestamp.fromDate(date),
        status: 'open',
      };
      if (personUid) advance.personUid = personUid;
      if (note) advance.note = note;

      transaction.update(loanRef, {
        advances: [...(loan.advances ?? []), advance],
        timeline: arrayUnion({
          action: 'updated', by: user.uid, byName: user.displayName, at: Timestamp.now(),
          changes: `advance ₹${amount.toLocaleString('en-IN')} to ${personName} (business float)`,
        }),
      });
    });

    this.invalidateCaches();
  }

  /** Settle an advance: record what was actually spent (books a business expense) and
   *  optionally return the leftover to the holder. Any un-returned balance stays as the
   *  person's cash in hand. 1 read, up to 4 writes. */
  async settleAdvance(
    loanId: string,
    advanceId: string,
    spentAmount: number,
    expense: {
      description: string;
      category: string;
      categoryName: string;
      segment: string;
      segmentName: string;
      paymentMethod?: 'cash' | 'upi';
    },
    returnRemaining: boolean,
    date: Date,
  ): Promise<void> {
    const user = this.authService.requireUser();
    if (spentAmount < 0) throw new Error('Spent amount cannot be negative');

    await runTransaction(this.firestore, async (transaction) => {
      const loanRef = doc(this.firestore, 'loans', loanId);
      const loanSnap = await transaction.get(loanRef);
      const loan = loanSnap.data() as Loan;

      if (loan.loanCategory !== 'formal') throw new Error('Not a formal loan');

      const advances = [...(loan.advances ?? [])];
      const idx = advances.findIndex(a => a.id === advanceId);
      if (idx === -1) throw new Error('Advance not found');
      const advance = advances[idx];
      const balance = advance.amount - advance.spent - advance.returned;
      if (spentAmount > balance) {
        throw new Error(`Spent ₹${spentAmount.toLocaleString('en-IN')} exceeds advance balance ₹${balance.toLocaleString('en-IN')}`);
      }

      const month = getMonthString(date);
      const year = getYear(date);

      // Book the business expense for the spent portion, funded by the advance holder
      if (spentAmount > 0) {
        const paidBy = advance.personUid ?? 'other';
        const paidByName = advance.personName;
        const txnRef = doc(collection(this.firestore, 'transactions'));
        transaction.set(txnRef, {
          id: txnRef.id,
          type: 'expense',
          date: Timestamp.fromDate(date),
          amount: spentAmount,
          category: expense.category,
          categoryName: expense.categoryName,
          segment: expense.segment,
          segmentName: expense.segmentName,
          description: expense.description,
          paymentMethod: expense.paymentMethod ?? 'cash',
          paidBy,
          paidByName,
          createdBy: user.uid,
          createdByName: user.displayName,
          createdAt: serverTimestamp(),
          isDeleted: false,
          timeline: [{ action: 'created', by: user.uid, byName: user.displayName, at: Timestamp.now() }],
          expensePaymentStatus: 'paid',
          linkedLoanId: loanId,
          month, year,
        });

        const personKey = paidBy === 'other'
          ? paidByName.trim().replace(/\s+/g, ' ')
              .split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
              .replace(/[.$/\[\]#]/g, '_')
          : paidBy;

        transaction.set(doc(this.firestore, 'monthlySummaries', `${month}-${expense.segment}`), {
          totalExpense: increment(spentAmount),
          netProfit: increment(-spentAmount),
          [`expenseByCategory.${expense.category}`]: increment(spentAmount),
          [`expenseByCategoryId.${expense.category}`]: increment(spentAmount),
          [`expenseByPerson.${personKey}`]: increment(spentAmount),
          month, year, segment: expense.segment, updatedAt: serverTimestamp(),
        }, { merge: true });

        transaction.set(doc(this.firestore, 'yearlySummaries', `${year}-${expense.segment}`), {
          totalExpense: increment(spentAmount),
          netProfit: increment(-spentAmount),
          [`expenseByCategory.${expense.category}`]: increment(spentAmount),
          [`expenseByCategoryId.${expense.category}`]: increment(spentAmount),
          [`expenseByPerson.${personKey}`]: increment(spentAmount),
          year, segment: expense.segment, updatedAt: serverTimestamp(),
        }, { merge: true });
      }

      const returnedNow = returnRemaining ? (balance - spentAmount) : 0;
      const updated: LoanAdvance = {
        ...advance,
        spent: advance.spent + spentAmount,
        returned: advance.returned + returnedNow,
      };
      const newBalance = updated.amount - updated.spent - updated.returned;
      updated.status = newBalance <= 0 ? 'settled' : 'open';
      advances[idx] = updated;

      const parts: string[] = [];
      if (spentAmount > 0) parts.push(`spent ₹${spentAmount.toLocaleString('en-IN')}`);
      if (returnedNow > 0) parts.push(`returned ₹${returnedNow.toLocaleString('en-IN')}`);

      transaction.update(loanRef, {
        advances,
        // Only the spent portion is consumed from the loan; returned cash is unspent (back with holder)
        utilizationTotal: increment(spentAmount),
        utilizationRemaining: increment(-spentAmount),
        timeline: arrayUnion({
          action: 'updated', by: user.uid, byName: user.displayName, at: Timestamp.now(),
          changes: `advance to ${advance.personName} settled: ${parts.join(', ') || 'no change'}`,
        }),
      });
    });

    this.invalidateCaches();
  }

  /** Remove a deduction from a formal loan — 1 read, 1 write */
  async removeDeduction(loanId: string, deductionId: string): Promise<void> {
    const user = this.authService.requireUser();

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

  // ==================== Payment recording (delegated to LoanPaymentsService) ====================

  addEMIPayment = async (...args: Parameters<LoanPaymentsService['addEMIPayment']>) => {
    await this.payments.addEMIPayment(...args);
    this.invalidateCaches();
  };

  addInterestPayment = async (...args: Parameters<LoanPaymentsService['addInterestPayment']>) => {
    await this.payments.addInterestPayment(...args);
    this.invalidateCaches();
  };

  closePrincipal = async (...args: Parameters<LoanPaymentsService['closePrincipal']>) => {
    await this.payments.closePrincipal(...args);
    this.invalidateCaches();
  };

  addPartPayment = async (...args: Parameters<LoanPaymentsService['addPartPayment']>) => {
    await this.payments.addPartPayment(...args);
    this.invalidateCaches();
  };

  addPenaltyPayment = async (...args: Parameters<LoanPaymentsService['addPenaltyPayment']>) => {
    await this.payments.addPenaltyPayment(...args);
    this.invalidateCaches();
  };

  updateInterestRate = async (...args: Parameters<LoanPaymentsService['updateInterestRate']>) => {
    await this.payments.updateInterestRate(...args);
    this.invalidateCaches();
  };

  preCloseLoan = async (...args: Parameters<LoanPaymentsService['preCloseLoan']>) => {
    await this.payments.preCloseLoan(...args);
    this.invalidateCaches();
  };

  balanceTransfer = async (...args: Parameters<LoanPaymentsService['balanceTransfer']>): Promise<string> => {
    const newLoanId = await this.payments.balanceTransfer(...args);
    this.invalidateCaches();
    return newLoanId;
  };

  // ==================== Collateral & Document Management ====================

  /** Add collateral item. 1 read, 1 write */
  async addCollateral(loanId: string, item: Omit<CollateralItem, 'id'>): Promise<void> {
    const user = this.authService.requireUser();
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
    const user = this.authService.requireUser();
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
    const user = this.authService.requireUser();
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
    const user = this.authService.requireUser();
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
    const user = this.authService.requireUser();
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
    const user = this.authService.requireUser();
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
    const user = this.authService.requireUser();

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
