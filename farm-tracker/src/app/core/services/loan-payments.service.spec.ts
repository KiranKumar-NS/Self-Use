/**
 * Tests for LoanPaymentsService — the formal-loan money paths (EMI, interest-only,
 * part-payment). Every path must create a loan-linked expense transaction AND bump
 * the monthly + yearly summaries in the same Firestore transaction.
 */

const mockGetDocResults: any[] = [];
const mockTxnCaptures: any[] = [];
const mockInjected = {
  requireUser: () => ({ uid: 'test-uid', displayName: 'Test User' }),
};

vi.mock('@angular/fire/firestore', () => ({
  Firestore: class {},
  collection: vi.fn((_fs: any, path: string) => ({ path })),
  doc: vi.fn((...args: any[]) => args.length > 2
    ? { id: args[2], path: `${args[1]}/${args[2]}` }
    : { id: 'new-id', path: `${args[0].path}/new-id` }),
  runTransaction: vi.fn(async (_fs: any, fn: any) => {
    const transaction = {
      get: vi.fn(async () => {
        if (mockGetDocResults.length > 0) return mockGetDocResults.shift();
        return { exists: () => false, data: () => undefined };
      }),
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    mockTxnCaptures.push(transaction);
    return fn(transaction);
  }),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
  increment: vi.fn((n: number) => ({ _increment: n })),
  arrayUnion: vi.fn((...args: any[]) => ({ _arrayUnion: args })),
  Timestamp: {
    fromDate: (d: Date) => ({ toDate: () => d, toMillis: () => d.getTime() }),
    now: () => ({ toDate: () => new Date(), toMillis: () => Date.now() }),
  },
}));

vi.mock('@angular/fire/auth', () => ({ Auth: class {}, onAuthStateChanged: vi.fn() }));

vi.mock('@angular/core', async () => {
  const actual = await vi.importActual('@angular/core');
  return { ...(actual as any), inject: vi.fn(() => mockInjected) };
});

import { LoanPaymentsService } from './loan-payments.service';

describe('LoanPaymentsService', () => {
  let service: LoanPaymentsService;

  function queueGetDoc(data: any) {
    mockGetDocResults.push({ exists: () => true, data: () => data });
  }

  function lastTxn() {
    return mockTxnCaptures.slice(-1)[0];
  }

  function setsFor(prefix: string): any[][] {
    return lastTxn().set.mock.calls.filter((c: any[]) => c[0].path.startsWith(prefix));
  }

  function updatesFor(prefix: string): any[][] {
    return lastTxn().update.mock.calls.filter((c: any[]) => c[0].path.startsWith(prefix));
  }

  const formalEmiLoan = (overrides: Record<string, any> = {}) => ({
    id: 'loan-1', loanCategory: 'formal', repaymentType: 'emi',
    amount: 120000, totalRepaid: 0, balanceRemaining: 120000, outstandingBalance: 120000,
    emisPaid: 0, totalEMIs: 12, nextPaymentNumber: 1,
    segment: 'seg1', segmentName: 'Goats', personName: 'HDFC', loanSourceName: 'HDFC Bank',
    timeline: [], utilizationRemaining: 20000,
    ...overrides,
  });

  const interestOnlyLoan = (overrides: Record<string, any> = {}) => ({
    ...formalEmiLoan({ repaymentType: 'interest_only', interestPaymentFrequency: 'monthly', totalInterestPaymentsMade: 0 }),
    ...overrides,
  });

  beforeEach(() => {
    service = new LoanPaymentsService();
    vi.clearAllMocks();
    mockGetDocResults.length = 0;
    mockTxnCaptures.length = 0;
  });

  // ──────────── addEMIPayment ────────────

  describe('addEMIPayment', () => {
    const emi = {
      amount: 11000, emiNumber: 1, principalPortion: 10000, interestPortion: 1000,
      date: new Date('2026-03-15'), paidByUid: 'uid-raju', paidByName: 'Raju',
    };

    it('should write repayment + expense txn + monthly & yearly summaries + loan counters in one transaction', async () => {
      queueGetDoc(formalEmiLoan());

      await service.addEMIPayment('loan-1', emi);

      expect(lastTxn().set).toHaveBeenCalledTimes(4);

      const repayment = setsFor('loans/loan-1/repayments/')[0][1];
      expect(repayment).toMatchObject({ amount: 11000, isEMIPayment: true, emiNumber: 1, principalPortion: 10000, interestPortion: 1000, paidBy: 'uid-raju' });

      const txn = setsFor('transactions/')[0][1];
      expect(txn).toMatchObject({
        type: 'expense', amount: 11000, category: 'loan-repayment', linkedLoanId: 'loan-1',
        segment: 'seg1', month: '2026-03', year: 2026, isDeleted: false, expensePaymentStatus: 'paid',
        paidBy: 'uid-raju', paidByName: 'Raju', createdBy: 'test-uid',
      });
      expect(txn.timeline).toHaveLength(1);

      const [monthlyRef, monthly] = setsFor('monthlySummaries/')[0];
      expect(monthlyRef.path).toBe('monthlySummaries/2026-03-seg1');
      expect(monthly).toMatchObject({
        totalExpense: { _increment: 11000 },
        netProfit: { _increment: -11000 },
        'expenseByCategoryId.loan-repayment': { _increment: 11000 },
        'expenseByPerson.uid-raju': { _increment: 11000 },
        month: '2026-03', year: 2026, segment: 'seg1',
      });
      expect(setsFor('monthlySummaries/')[0][2]).toEqual({ merge: true });

      const [yearlyRef, yearly] = setsFor('yearlySummaries/')[0];
      expect(yearlyRef.path).toBe('yearlySummaries/2026-seg1');
      expect(yearly).toMatchObject({ totalExpense: { _increment: 11000 }, netProfit: { _increment: -11000 }, year: 2026, segment: 'seg1' });
      expect(yearly.month).toBeUndefined();

      const loan = updatesFor('loans/loan-1')[0][1];
      expect(loan).toMatchObject({
        totalRepaid: 11000, balanceRemaining: 109000, repaymentStatus: 'partial', emisPaid: 1,
        totalInterestPaid: { _increment: 1000 }, totalPrincipalPaid: { _increment: 10000 },
        outstandingBalance: { _increment: -10000 }, nextPaymentNumber: 2,
      });
      expect(loan.nextPaymentDueDate).not.toBeNull();
      expect(loan.timeline).toHaveLength(1);
    });

    it('should close the loan on the final EMI', async () => {
      queueGetDoc(formalEmiLoan({ emisPaid: 11, totalRepaid: 121000, nextPaymentNumber: 12 }));

      await service.addEMIPayment('loan-1', { ...emi, emiNumber: 12 });

      const loan = updatesFor('loans/loan-1')[0][1];
      expect(loan).toMatchObject({ repaymentStatus: 'completed', emisPaid: 12, nextPaymentDueDate: null, nextPaymentNumber: null, closureReason: 'fully_paid', utilizationRemaining: 0 });
      expect(loan.loanClosureDate).toBeDefined();
    });

    it('should book the expense against the per-payment segment override', async () => {
      queueGetDoc(formalEmiLoan());

      await service.addEMIPayment('loan-1', { ...emi, segmentId: 'seg2', segmentName: 'Chickens' });

      expect(setsFor('transactions/')[0][1]).toMatchObject({ segment: 'seg2', segmentName: 'Chickens' });
      expect(setsFor('monthlySummaries/')[0][0].path).toBe('monthlySummaries/2026-03-seg2');
      expect(setsFor('yearlySummaries/')[0][0].path).toBe('yearlySummaries/2026-seg2');
    });

    it('should default the payer to the current user', async () => {
      queueGetDoc(formalEmiLoan());

      await service.addEMIPayment('loan-1', { ...emi, paidByUid: undefined, paidByName: undefined });

      expect(setsFor('transactions/')[0][1]).toMatchObject({ paidBy: 'test-uid', paidByName: 'Test User' });
      expect(setsFor('monthlySummaries/')[0][1]['expenseByPerson.test-uid']).toEqual({ _increment: 11000 });
    });

    it('should reject non-EMI loans without writing anything', async () => {
      queueGetDoc(interestOnlyLoan());

      await expect(service.addEMIPayment('loan-1', emi)).rejects.toThrow('EMI payments can only be made on EMI-type formal loans');
      expect(lastTxn().set).not.toHaveBeenCalled();
    });
  });

  // ──────────── addInterestPayment ────────────

  describe('addInterestPayment', () => {
    it('should bump summaries and interest counters but leave principal untouched', async () => {
      queueGetDoc(interestOnlyLoan());

      await service.addInterestPayment('loan-1', 1500, new Date('2026-04-02'), 'REF-1', undefined, 'uid-raju', 'Raju');

      expect(setsFor('transactions/')[0][1]).toMatchObject({ amount: 1500, linkedLoanId: 'loan-1', month: '2026-04', description: 'Interest payment #1 - HDFC Bank' });
      expect(setsFor('loans/loan-1/repayments/')[0][1]).toMatchObject({ interestPortion: 1500, principalPortion: 0, paymentReference: 'REF-1' });
      expect(setsFor('monthlySummaries/')[0][1]).toMatchObject({ totalExpense: { _increment: 1500 }, netProfit: { _increment: -1500 }, 'expenseByPerson.uid-raju': { _increment: 1500 } });
      expect(setsFor('yearlySummaries/')[0][1]).toMatchObject({ totalExpense: { _increment: 1500 } });

      const loan = updatesFor('loans/loan-1')[0][1];
      expect(loan).toMatchObject({ totalInterestPaid: { _increment: 1500 }, totalInterestPaymentsMade: { _increment: 1 }, nextPaymentNumber: 2 });
      expect(loan.totalRepaid).toBeUndefined();
      expect(loan.balanceRemaining).toBeUndefined();
      expect(loan.outstandingBalance).toBeUndefined();
    });

    it('should advance the due date by a week for weekly loans', async () => {
      queueGetDoc(interestOnlyLoan({ interestPaymentFrequency: 'weekly', nextPaymentDueDate: { toDate: () => new Date('2026-04-01') } }));

      await service.addInterestPayment('loan-1', 500, new Date('2026-04-02'));

      const due = updatesFor('loans/loan-1')[0][1].nextPaymentDueDate.toDate();
      expect(due.toISOString().slice(0, 10)).toBe('2026-04-08');
    });

    it('should reject EMI loans', async () => {
      queueGetDoc(formalEmiLoan());
      await expect(service.addInterestPayment('loan-1', 500, new Date())).rejects.toThrow('interest-only');
    });
  });

  // ──────────── addPartPayment ────────────

  describe('addPartPayment', () => {
    it('should reduce outstanding principal and record the expense', async () => {
      queueGetDoc(formalEmiLoan({ outstandingBalance: 50000 }));

      await service.addPartPayment('loan-1', 20000, new Date('2026-05-10'), undefined, undefined, undefined, undefined, 'uid-raju', 'Raju');

      expect(setsFor('transactions/')[0][1]).toMatchObject({ amount: 20000, linkedLoanId: 'loan-1', month: '2026-05', paidBy: 'uid-raju' });
      expect(setsFor('loans/loan-1/repayments/')[0][1]).toMatchObject({ isPartPayment: true, principalPortion: 20000, interestPortion: 0 });
      expect(setsFor('monthlySummaries/')[0][0].path).toBe('monthlySummaries/2026-05-seg1');
      expect(setsFor('monthlySummaries/')[0][1]['expenseByPerson.uid-raju']).toEqual({ _increment: 20000 });

      const loan = updatesFor('loans/loan-1')[0][1];
      expect(loan).toMatchObject({
        totalRepaid: 20000, balanceRemaining: 100000, repaymentStatus: 'partial',
        totalPrincipalPaid: { _increment: 20000 }, outstandingBalance: { _increment: -20000 }, totalPartPayments: { _increment: 20000 },
      });
      expect(loan.emisPaid).toBeUndefined();
      expect(loan.utilizationRemaining).toBeUndefined();
    });

    it('should complete the loan when the part-payment clears the outstanding principal', async () => {
      queueGetDoc(formalEmiLoan({ outstandingBalance: 20000 }));

      await service.addPartPayment('loan-1', 20000, new Date('2026-05-10'));

      expect(updatesFor('loans/loan-1')[0][1]).toMatchObject({ repaymentStatus: 'completed', utilizationRemaining: 0 });
    });

    it('should reject an amount above the outstanding principal', async () => {
      queueGetDoc(formalEmiLoan({ outstandingBalance: 5000 }));
      await expect(service.addPartPayment('loan-1', 6000, new Date())).rejects.toThrow('exceeds outstanding');
      expect(lastTxn().set).not.toHaveBeenCalled();
    });

    it('should reject simple loans', async () => {
      queueGetDoc(formalEmiLoan({ loanCategory: 'simple' }));
      await expect(service.addPartPayment('loan-1', 100, new Date())).rejects.toThrow('formal loans');
    });
  });
});
