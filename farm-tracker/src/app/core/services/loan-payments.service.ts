import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  increment,
  Timestamp,
  arrayUnion,
} from '@angular/fire/firestore';
import { Loan, LoanFormData, Repayment, InterestFrequency } from '../models/loan.model';
import { personSummaryKey } from '../models/transaction.model';
import { AuthService } from './auth.service';
import { getMonthString, getYear } from '../utils/date.utils';
import { appendTimelineCapped } from '../utils/timeline.utils';
import { toAnnualRate, annualToMonthlyDecimal } from './loan-math';

/**
 * Records payments against formal loans: EMI, interest-only, part-payment,
 * penalty, rate changes, pre-closure, and balance transfer. Extracted from
 * LoanService, which delegates here with an unchanged public API and owns
 * cache invalidation.
 */
@Injectable({ providedIn: 'root' })
export class LoanPaymentsService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);

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
      segmentId?: string;
      segmentName?: string;
    },
  ): Promise<void> {
    const user = this.authService.requireUser();

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
      const expSegment = data.segmentId || loan.segment;
      const expSegmentName = data.segmentName || loan.segmentName;

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
        scheduledDueDate: loan.nextPaymentDueDate ?? null,
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
        segment: expSegment,
        segmentName: expSegmentName,
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
      const summaryRef = doc(this.firestore, 'monthlySummaries', `${month}-${expSegment}`);
      const personKey = personSummaryKey(data.paidByUid, payer, user.uid);
      const summaryData = {
        totalExpense: increment(data.amount),
        netProfit: increment(-data.amount),
        [`expenseByCategory.loan-repayment`]: increment(data.amount),
        [`expenseByCategoryId.loan-repayment`]: increment(data.amount),
        [`expenseByPerson.${personKey}`]: increment(data.amount),
        month, year, segment: expSegment, updatedAt: serverTimestamp(),
      };
      transaction.set(summaryRef, summaryData, { merge: true });

      // Update yearly summary
      const yearlySummaryRef = doc(this.firestore, 'yearlySummaries', `${year}-${expSegment}`);
      transaction.set(yearlySummaryRef, {
        totalExpense: increment(data.amount),
        netProfit: increment(-data.amount),
        [`expenseByCategory.loan-repayment`]: increment(data.amount),
        [`expenseByCategoryId.loan-repayment`]: increment(data.amount),
        [`expenseByPerson.${personKey}`]: increment(data.amount),
        year, segment: expSegment, updatedAt: serverTimestamp(),
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
        timeline: appendTimelineCapped(loan.timeline, {
          action: 'updated', by: user.uid, byName: user.displayName, at: Timestamp.now(),
          changes: `EMI #${data.emiNumber}: ₹${data.amount.toLocaleString('en-IN')} by ${payer}`,
        }),
      };
      if (allDone) {
        loanUpdates['loanClosureDate'] = Timestamp.fromDate(data.date);
        loanUpdates['closureReason'] = 'fully_paid';
        loanUpdates['utilizationRemaining'] = 0;
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
    segmentId?: string,
    segmentName?: string,
  ): Promise<void> {
    const user = this.authService.requireUser();

    await runTransaction(this.firestore, async (transaction) => {
      const loanRef = doc(this.firestore, 'loans', loanId);
      const loanSnap = await transaction.get(loanRef);
      const loan = loanSnap.data() as Loan;

      if (loan.loanCategory !== 'formal' || loan.repaymentType !== 'interest_only') {
        throw new Error('Interest payments can only be made on interest-only loans');
      }

      const payer = paidByName ?? user.displayName;
      const personKey = personSummaryKey(paidByUid, payer, user.uid);
      const month = getMonthString(date);
      const year = getYear(date);
      const sourceName = loan.loanSourceName ?? loan.personName;
      const paymentNum = (loan.totalInterestPaymentsMade ?? 0) + 1;
      const expSeg = segmentId || loan.segment;
      const expSegName = segmentName || loan.segmentName;

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
        segment: expSeg,
        segmentName: expSegName,
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
      const summaryRef = doc(this.firestore, 'monthlySummaries', `${month}-${expSeg}`);
      transaction.set(summaryRef, {
        totalExpense: increment(amount),
        netProfit: increment(-amount),
        [`expenseByCategory.loan-repayment`]: increment(amount),
        [`expenseByCategoryId.loan-repayment`]: increment(amount),
        [`expenseByPerson.${personKey}`]: increment(amount),
        month, year, segment: expSeg, updatedAt: serverTimestamp(),
      }, { merge: true });
      transaction.set(doc(this.firestore, 'yearlySummaries', `${year}-${expSeg}`), {
        totalExpense: increment(amount),
        netProfit: increment(-amount),
        [`expenseByCategory.loan-repayment`]: increment(amount),
        [`expenseByCategoryId.loan-repayment`]: increment(amount),
        [`expenseByPerson.${personKey}`]: increment(amount),
        year, segment: expSeg, updatedAt: serverTimestamp(),
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
        timeline: appendTimelineCapped(loan.timeline, {
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
    segmentId?: string,
    segmentName?: string,
    paidByUid?: string,
    paidByName?: string,
  ): Promise<void> {
    const user = this.authService.requireUser();

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
      const expSeg = segmentId || loan.segment;
      const expSegName = segmentName || loan.segmentName;
      const payerUid = paidByUid ?? user.uid;
      const payer = paidByName ?? user.displayName;
      const personKey = personSummaryKey(paidByUid, payer, user.uid);

      // Create repayment doc
      const repRef = doc(collection(this.firestore, `loans/${loanId}/repayments`));
      transaction.set(repRef, {
        id: repRef.id,
        date: Timestamp.fromDate(date),
        amount,
        note: note ?? `Principal closure - ${sourceName}`,
        paidBy: payerUid,
        paidByName: payer,
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
        segment: expSeg,
        segmentName: expSegName,
        description: `Principal closure - ${sourceName}`,
        paymentMethod: 'upi',
        paidBy: payerUid,
        paidByName: payer,
        createdBy: user.uid,
        createdByName: user.displayName,
        createdAt: serverTimestamp(),
        isDeleted: false,
        timeline: [{ action: 'created', by: user.uid, byName: user.displayName, at: Timestamp.now() }],
        expensePaymentStatus: 'paid',
        linkedLoanId: loanId,
        month, year,
      });

      // Update monthly + yearly summaries
      const summaryRef = doc(this.firestore, 'monthlySummaries', `${month}-${expSeg}`);
      transaction.set(summaryRef, {
        totalExpense: increment(amount),
        netProfit: increment(-amount),
        [`expenseByCategory.loan-repayment`]: increment(amount),
        [`expenseByCategoryId.loan-repayment`]: increment(amount),
        [`expenseByPerson.${personKey}`]: increment(amount),
        month, year, segment: expSeg, updatedAt: serverTimestamp(),
      }, { merge: true });
      transaction.set(doc(this.firestore, 'yearlySummaries', `${year}-${expSeg}`), {
        totalExpense: increment(amount),
        netProfit: increment(-amount),
        [`expenseByCategory.loan-repayment`]: increment(amount),
        [`expenseByCategoryId.loan-repayment`]: increment(amount),
        [`expenseByPerson.${personKey}`]: increment(amount),
        year, segment: expSeg, updatedAt: serverTimestamp(),
      }, { merge: true });

      // Update loan — close it
      transaction.update(loanRef, {
        totalRepaid: increment(amount),
        totalPrincipalPaid: increment(outstanding),
        balanceRemaining: 0,
        outstandingBalance: 0,
        utilizationRemaining: 0,
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
    segmentId?: string,
    segmentName?: string,
    paidByUid?: string,
    paidByName?: string,
  ): Promise<void> {
    const user = this.authService.requireUser();

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
      const expSeg = segmentId || loan.segment;
      const expSegName = segmentName || loan.segmentName;
      const payerUid = paidByUid ?? user.uid;
      const payer = paidByName ?? user.displayName;
      const personKey = personSummaryKey(paidByUid, payer, user.uid);

      // Create repayment doc
      const repRef = doc(collection(this.firestore, `loans/${loanId}/repayments`));
      transaction.set(repRef, {
        id: repRef.id,
        date: Timestamp.fromDate(date),
        amount,
        note: note ?? `Part-payment - ${sourceName}`,
        paidBy: payerUid,
        paidByName: payer,
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
        segment: expSeg,
        segmentName: expSegName,
        description: `Part-payment - ${sourceName}`,
        paymentMethod: 'upi',
        paidBy: payerUid,
        paidByName: payer,
        createdBy: user.uid,
        createdByName: user.displayName,
        createdAt: serverTimestamp(),
        isDeleted: false,
        timeline: [{ action: 'created', by: user.uid, byName: user.displayName, at: Timestamp.now() }],
        expensePaymentStatus: 'paid',
        linkedLoanId: loanId,
        month, year,
      });

      // Update monthly + yearly summaries
      const summaryRef = doc(this.firestore, 'monthlySummaries', `${month}-${expSeg}`);
      transaction.set(summaryRef, {
        totalExpense: increment(amount),
        netProfit: increment(-amount),
        [`expenseByCategory.loan-repayment`]: increment(amount),
        [`expenseByCategoryId.loan-repayment`]: increment(amount),
        [`expenseByPerson.${personKey}`]: increment(amount),
        month, year, segment: expSeg, updatedAt: serverTimestamp(),
      }, { merge: true });
      transaction.set(doc(this.firestore, 'yearlySummaries', `${year}-${expSeg}`), {
        totalExpense: increment(amount),
        netProfit: increment(-amount),
        [`expenseByCategory.loan-repayment`]: increment(amount),
        [`expenseByCategoryId.loan-repayment`]: increment(amount),
        [`expenseByPerson.${personKey}`]: increment(amount),
        year, segment: expSeg, updatedAt: serverTimestamp(),
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
        ...(newStatus === 'completed' ? { utilizationRemaining: 0 } : {}),
        timeline: appendTimelineCapped(loan.timeline, {
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
    segmentId?: string,
    segmentName?: string,
    paidByUid?: string,
    paidByName?: string,
  ): Promise<void> {
    const user = this.authService.requireUser();

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
      const expSeg = segmentId || loan.segment;
      const expSegName = segmentName || loan.segmentName;
      const payerUid = paidByUid ?? user.uid;
      const payer = paidByName ?? user.displayName;
      const personKey = personSummaryKey(paidByUid, payer, user.uid);

      // Create repayment doc
      const repRef = doc(collection(this.firestore, `loans/${loanId}/repayments`));
      transaction.set(repRef, {
        id: repRef.id,
        date: Timestamp.fromDate(date),
        amount: penaltyAmount,
        note: note ?? `Late penalty for EMI #${forEMINumber}`,
        paidBy: payerUid,
        paidByName: payer,
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
        segment: expSeg,
        segmentName: expSegName,
        description: `Late penalty EMI #${forEMINumber} - ${sourceName}`,
        paymentMethod: 'upi',
        paidBy: payerUid,
        paidByName: payer,
        createdBy: user.uid,
        createdByName: user.displayName,
        createdAt: serverTimestamp(),
        isDeleted: false,
        timeline: [{ action: 'created', by: user.uid, byName: user.displayName, at: Timestamp.now() }],
        expensePaymentStatus: 'paid',
        linkedLoanId: loanId,
        month, year,
      });

      // Update monthly + yearly summaries
      const summaryRef = doc(this.firestore, 'monthlySummaries', `${month}-${expSeg}`);
      transaction.set(summaryRef, {
        totalExpense: increment(penaltyAmount),
        netProfit: increment(-penaltyAmount),
        [`expenseByCategory.loan-repayment`]: increment(penaltyAmount),
        [`expenseByCategoryId.loan-repayment`]: increment(penaltyAmount),
        [`expenseByPerson.${personKey}`]: increment(penaltyAmount),
        month, year, segment: expSeg, updatedAt: serverTimestamp(),
      }, { merge: true });
      transaction.set(doc(this.firestore, 'yearlySummaries', `${year}-${expSeg}`), {
        totalExpense: increment(penaltyAmount),
        netProfit: increment(-penaltyAmount),
        [`expenseByCategory.loan-repayment`]: increment(penaltyAmount),
        [`expenseByCategoryId.loan-repayment`]: increment(penaltyAmount),
        [`expenseByPerson.${personKey}`]: increment(penaltyAmount),
        year, segment: expSeg, updatedAt: serverTimestamp(),
      }, { merge: true });

      // Update loan — only penalty counter
      transaction.update(loanRef, {
        totalPenaltyPaid: increment(penaltyAmount),
        timeline: appendTimelineCapped(loan.timeline, {
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
    const user = this.authService.requireUser();
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
        timeline: appendTimelineCapped(loan.timeline, {
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
    segmentId?: string,
    segmentName?: string,
    paidByUid?: string,
    paidByName?: string,
  ): Promise<void> {
    const user = this.authService.requireUser();

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
      const expSeg = segmentId || loan.segment;
      const expSegName = segmentName || loan.segmentName;
      const payerUid = paidByUid ?? user.uid;
      const payer = paidByName ?? user.displayName;
      const personKey = personSummaryKey(paidByUid, payer, user.uid);

      // Create repayment doc
      const repRef = doc(collection(this.firestore, `loans/${loanId}/repayments`));
      transaction.set(repRef, {
        id: repRef.id,
        date: Timestamp.fromDate(date),
        amount: totalPayment,
        note: note ?? `Pre-closure - ${sourceName}`,
        paidBy: payerUid,
        paidByName: payer,
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
        segment: expSeg,
        segmentName: expSegName,
        description: `Pre-closure - ${sourceName}${charges > 0 ? ` (charges: ₹${charges.toLocaleString('en-IN')})` : ''}`,
        paymentMethod: 'upi',
        paidBy: payerUid,
        paidByName: payer,
        createdBy: user.uid,
        createdByName: user.displayName,
        createdAt: serverTimestamp(),
        isDeleted: false,
        timeline: [{ action: 'created', by: user.uid, byName: user.displayName, at: Timestamp.now() }],
        expensePaymentStatus: 'paid',
        linkedLoanId: loanId,
        month, year,
      });

      // Update monthly + yearly summaries
      const summaryRef = doc(this.firestore, 'monthlySummaries', `${month}-${expSeg}`);
      transaction.set(summaryRef, {
        totalExpense: increment(totalPayment),
        netProfit: increment(-totalPayment),
        [`expenseByCategory.loan-repayment`]: increment(totalPayment),
        [`expenseByCategoryId.loan-repayment`]: increment(totalPayment),
        [`expenseByPerson.${personKey}`]: increment(totalPayment),
        month, year, segment: expSeg, updatedAt: serverTimestamp(),
      }, { merge: true });
      transaction.set(doc(this.firestore, 'yearlySummaries', `${year}-${expSeg}`), {
        totalExpense: increment(totalPayment),
        netProfit: increment(-totalPayment),
        [`expenseByCategory.loan-repayment`]: increment(totalPayment),
        [`expenseByCategoryId.loan-repayment`]: increment(totalPayment),
        [`expenseByPerson.${personKey}`]: increment(totalPayment),
        year, segment: expSeg, updatedAt: serverTimestamp(),
      }, { merge: true });

      // Close loan
      transaction.update(loanRef, {
        totalRepaid: increment(totalPayment),
        totalPrincipalPaid: increment(amount),
        balanceRemaining: 0,
        outstandingBalance: 0,
        utilizationRemaining: 0,
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
    const user = this.authService.requireUser();
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

      // Update monthly + yearly summaries
      const summaryRef = doc(this.firestore, 'monthlySummaries', `${month}-${oldLoan.segment}`);
      transaction.set(summaryRef, {
        totalExpense: increment(outstanding),
        netProfit: increment(-outstanding),
        [`expenseByCategory.loan-repayment`]: increment(outstanding),
        [`expenseByCategoryId.loan-repayment`]: increment(outstanding),
        [`expenseByPerson.${user.uid}`]: increment(outstanding),
        month, year, segment: oldLoan.segment, updatedAt: serverTimestamp(),
      }, { merge: true });
      transaction.set(doc(this.firestore, 'yearlySummaries', `${year}-${oldLoan.segment}`), {
        totalExpense: increment(outstanding),
        netProfit: increment(-outstanding),
        [`expenseByCategory.loan-repayment`]: increment(outstanding),
        [`expenseByCategoryId.loan-repayment`]: increment(outstanding),
        [`expenseByPerson.${user.uid}`]: increment(outstanding),
        year, segment: oldLoan.segment, updatedAt: serverTimestamp(),
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
        utilizationRemaining: 0,
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
}
