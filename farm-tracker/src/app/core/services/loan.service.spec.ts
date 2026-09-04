/**
 * Tests for LoanService write paths: simple loans, repayments with parent-loan
 * utilization sync, business utilization (the summary-writing path), personal
 * withdrawals, and delete reversal.
 */

const mockGetDocResults: any[] = [];
const mockTxnCaptures: any[] = [];
const mockInjected = {
  requireUser: () => ({ uid: 'test-uid', displayName: 'Test User' }),
  clearCache: vi.fn(),
};

vi.mock('@angular/fire/firestore', () => {
  const batch = { set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) };
  const nextSnap = () => {
    if (mockGetDocResults.length > 0) return mockGetDocResults.shift();
    return { exists: () => false, data: () => undefined };
  };
  return {
    Firestore: class {},
    collection: vi.fn((_fs: any, path: string) => ({ path })),
    doc: vi.fn((...args: any[]) => args.length > 2
      ? { id: args[2], path: `${args[1]}/${args[2]}` }
      : { id: 'new-id', path: `${args[0].path}/new-id` }),
    getDoc: vi.fn(async () => nextSnap()),
    getDocs: vi.fn().mockResolvedValue({ docs: [], empty: true, size: 0 }),
    query: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    startAfter: vi.fn(),
    writeBatch: vi.fn(() => batch),
    runTransaction: vi.fn(async (_fs: any, fn: any) => {
      const transaction = { get: vi.fn(async () => nextSnap()), set: vi.fn(), update: vi.fn(), delete: vi.fn() };
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
    DocumentSnapshot: class {},
  };
});

vi.mock('@angular/fire/auth', () => ({ Auth: class {}, onAuthStateChanged: vi.fn() }));

vi.mock('@angular/core', async () => {
  const actual = await vi.importActual('@angular/core');
  return { ...(actual as any), inject: vi.fn(() => mockInjected) };
});

import { LoanService } from './loan.service';
import { writeBatch } from '@angular/fire/firestore';

describe('LoanService', () => {
  let service: LoanService;

  function queueGetDoc(data: any) {
    mockGetDocResults.push({ exists: () => true, data: () => data });
  }

  function getBatch() {
    return (writeBatch as any).mock.results.slice(-1)[0]?.value;
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

  const simpleLoan = (overrides: Record<string, any> = {}) => ({
    id: 'loan-1', amount: 10000, totalRepaid: 0, balanceRemaining: 10000,
    type: 'given', personName: 'Raju', purpose: 'Advance', segment: 'seg1', segmentName: 'Goats',
    repaymentStatus: 'pending', timeline: [], loanCategory: 'simple',
    ...overrides,
  });

  const formalLoan = (overrides: Record<string, any> = {}) => ({
    id: 'formal-1', loanCategory: 'formal', amount: 200000, totalRepaid: 0, balanceRemaining: 200000,
    personName: 'HDFC', loanSourceName: 'HDFC Bank', segment: 'seg1', segmentName: 'Goats',
    utilizationTotal: 50000, utilizationRemaining: 150000, timeline: [],
    ...overrides,
  });

  beforeEach(() => {
    service = new LoanService();
    vi.clearAllMocks();
    mockGetDocResults.length = 0;
    mockTxnCaptures.length = 0;
  });

  // ──────────── create ────────────

  describe('create', () => {
    it('should open a simple loan with the full balance outstanding', async () => {
      const id = await service.create({
        date: new Date('2026-01-10'), amount: 10000, type: 'given', personName: 'Raju', purpose: 'Advance',
        segment: 'seg1', segmentName: 'Goats', month: '2026-01', year: 2026,
      });

      expect(id).toBe('new-id');
      const [ref, data] = getBatch().set.mock.calls[0];
      expect(ref.path).toBe('loans/new-id');
      expect(data).toMatchObject({
        id: 'new-id', amount: 10000, totalRepaid: 0, balanceRemaining: 10000, repaymentStatus: 'pending',
        recordedBy: 'test-uid', isDeleted: false, month: '2026-01', year: 2026,
      });
      expect(data.timeline).toEqual([expect.objectContaining({ action: 'created', by: 'test-uid' })]);
    });
  });

  // ──────────── addRepayment ────────────

  describe('addRepayment', () => {
    it('should record a partial repayment and move the balance', async () => {
      queueGetDoc(simpleLoan());

      await service.addRepayment('loan-1', 4000, 'first', new Date('2026-02-01'), 'uid-raju', 'Raju');

      const repayment = setsFor('loans/loan-1/repayments/')[0][1];
      expect(repayment).toMatchObject({ amount: 4000, note: 'first', paidBy: 'uid-raju', paidByName: 'Raju', recordedBy: 'test-uid' });
      const loan = updatesFor('loans/loan-1')[0][1];
      expect(loan).toMatchObject({ totalRepaid: 4000, balanceRemaining: 6000, repaymentStatus: 'partial' });
      expect(loan.timeline[0].changes).toContain('+₹4,000 by Raju (partial)');
    });

    it('should complete the loan when the balance is cleared', async () => {
      queueGetDoc(simpleLoan({ totalRepaid: 4000, balanceRemaining: 6000, repaymentStatus: 'partial' }));

      await service.addRepayment('loan-1', 6000, '', new Date());

      expect(updatesFor('loans/loan-1')[0][1]).toMatchObject({ totalRepaid: 10000, balanceRemaining: 0, repaymentStatus: 'completed' });
    });

    it('should return repaid money to the parent formal loan pool', async () => {
      queueGetDoc(simpleLoan({ parentFormalLoanId: 'formal-1' }));
      queueGetDoc(formalLoan());

      await service.addRepayment('loan-1', 4000, '', new Date());

      const parent = updatesFor('loans/formal-1')[0][1];
      expect(parent).toMatchObject({ utilizationTotal: { _increment: -4000 }, utilizationRemaining: { _increment: 4000 } });
    });

    it('should reject zero and over-repayment', async () => {
      queueGetDoc(simpleLoan());
      await expect(service.addRepayment('loan-1', 0, '', new Date())).rejects.toThrow('greater than 0');
      queueGetDoc(simpleLoan());
      await expect(service.addRepayment('loan-1', 10001, '', new Date())).rejects.toThrow('exceeds balance');
      expect(lastTxn().set).not.toHaveBeenCalled();
    });
  });

  // ──────────── addMore ────────────

  describe('addMore', () => {
    it('should grow the loan and record a negative (disbursement) repayment', async () => {
      queueGetDoc(simpleLoan());

      await service.addMore('loan-1', 2500, 'top-up', new Date('2026-02-05'));

      expect(updatesFor('loans/loan-1')[0][1]).toMatchObject({ amount: 12500, balanceRemaining: 12500, repaymentStatus: 'pending' });
      expect(setsFor('loans/loan-1/repayments/')[0][1]).toMatchObject({ amount: -2500, note: 'top-up' });
    });

    it('should draw the extra amount from the parent pool and refuse when it is short', async () => {
      queueGetDoc(simpleLoan({ parentFormalLoanId: 'formal-1' }));
      queueGetDoc(formalLoan({ utilizationRemaining: 1000 }));
      await expect(service.addMore('loan-1', 2500, '', new Date())).rejects.toThrow('exceeds parent loan remaining');

      queueGetDoc(simpleLoan({ parentFormalLoanId: 'formal-1' }));
      queueGetDoc(formalLoan({ utilizationRemaining: 5000 }));
      await service.addMore('loan-1', 2500, '', new Date());
      expect(updatesFor('loans/formal-1')[0][1]).toMatchObject({ utilizationTotal: { _increment: 2500 }, utilizationRemaining: { _increment: -2500 } });
    });
  });

  // ──────────── addBusinessUtilization ────────────

  describe('addBusinessUtilization', () => {
    const spend = {
      description: 'Feed purchase', amount: 20000, date: new Date('2026-03-15'),
      category: 'feed', categoryName: 'Feed', segment: 'seg2', segmentName: 'Chickens',
      paidBy: 'uid-raju', paidByName: 'Raju',
    };

    it('should create a loan-linked expense and bump monthly + yearly summaries atomically', async () => {
      queueGetDoc(formalLoan());

      const txnId = await service.addBusinessUtilization('formal-1', spend);

      expect(txnId).toBe('new-id');
      const txn = setsFor('transactions/')[0][1];
      expect(txn).toMatchObject({
        type: 'expense', amount: 20000, category: 'feed', segment: 'seg2', linkedLoanId: 'formal-1',
        expensePaymentStatus: 'paid', paidBy: 'uid-raju', month: '2026-03', year: 2026, isDeleted: false,
      });

      const [monthlyRef, monthly] = setsFor('monthlySummaries/')[0];
      expect(monthlyRef.path).toBe('monthlySummaries/2026-03-seg2');
      expect(monthly).toMatchObject({
        totalExpense: { _increment: 20000 }, netProfit: { _increment: -20000 },
        'expenseByCategory.feed': { _increment: 20000 }, 'expenseByCategoryId.feed': { _increment: 20000 },
        'expenseByPerson.uid-raju': { _increment: 20000 }, month: '2026-03', year: 2026, segment: 'seg2',
      });
      const [yearlyRef, yearly] = setsFor('yearlySummaries/')[0];
      expect(yearlyRef.path).toBe('yearlySummaries/2026-seg2');
      expect(yearly).toMatchObject({ totalExpense: { _increment: 20000 }, 'expenseByPerson.uid-raju': { _increment: 20000 }, year: 2026, segment: 'seg2' });

      expect(updatesFor('loans/formal-1')[0][1]).toMatchObject({ utilizationTotal: { _increment: 20000 }, utilizationRemaining: { _increment: -20000 } });
    });

    it('should key the person bucket by normalized name for custom "other" payers', async () => {
      queueGetDoc(formalLoan());

      await service.addBusinessUtilization('formal-1', { ...spend, paidBy: 'other', paidByName: '  ravi   kumar ' });

      expect(setsFor('monthlySummaries/')[0][1]['expenseByPerson.Ravi Kumar']).toEqual({ _increment: 20000 });
    });

    it('should exclude cash advanced out to others from the spendable pool', async () => {
      queueGetDoc(formalLoan({
        utilizationRemaining: 30000,
        advances: [{ id: 'adv1', personName: 'Sita', amount: 15000, spent: 0, returned: 0, status: 'open' }],
      }));

      await expect(service.addBusinessUtilization('formal-1', spend)).rejects.toThrow('exceeds in-hand funds ₹15,000');
      expect(lastTxn().set).not.toHaveBeenCalled();
    });

    it('should reject simple loans', async () => {
      queueGetDoc(simpleLoan());
      await expect(service.addBusinessUtilization('loan-1', spend)).rejects.toThrow('formal loans');
    });
  });

  // ──────────── addPersonalUtilization ────────────

  describe('addPersonalUtilization', () => {
    it('should open a linked simple loan and consume the parent pool', async () => {
      queueGetDoc(formalLoan());

      const id = await service.addPersonalUtilization('formal-1', 'Raju', 'uid-raju', 8000, 'bike', new Date('2026-03-01'));

      expect(id).toBe('new-id');
      const simple = setsFor('loans/new-id')[0][1];
      expect(simple).toMatchObject({
        amount: 8000, type: 'given', personName: 'Raju', personUid: 'uid-raju', purpose: 'bike',
        balanceRemaining: 8000, loanCategory: 'simple', parentFormalLoanId: 'formal-1', month: '2026-03',
      });
      expect(updatesFor('loans/formal-1')[0][1]).toMatchObject({ utilizationTotal: { _increment: 8000 }, utilizationRemaining: { _increment: -8000 } });
    });

    it('should refuse to withdraw more than is in hand', async () => {
      queueGetDoc(formalLoan({ utilizationRemaining: 5000 }));
      await expect(service.addPersonalUtilization('formal-1', 'Raju', undefined, 8000, '', new Date())).rejects.toThrow('exceeds in-hand funds');
    });
  });

  // ──────────── softDelete ────────────

  describe('softDelete', () => {
    it('should restore the unreturned balance of a personal withdrawal to its parent', async () => {
      queueGetDoc(simpleLoan({ parentFormalLoanId: 'formal-1', balanceRemaining: 6000 })); // getDoc
      queueGetDoc(formalLoan());                                                             // transaction.get(parent)
      queueGetDoc(simpleLoan({ parentFormalLoanId: 'formal-1', balanceRemaining: 6000 })); // transaction.get(loan)

      await service.softDelete('loan-1');

      expect(updatesFor('loans/formal-1')[0][1]).toMatchObject({ utilizationTotal: { _increment: -6000 }, utilizationRemaining: { _increment: 6000 } });
      expect(updatesFor('loans/loan-1')[0][1]).toMatchObject({ isDeleted: true });
    });

    it('should soft-delete a standalone simple loan with a batch write', async () => {
      queueGetDoc(simpleLoan());

      await service.softDelete('loan-1');

      const [ref, data] = getBatch().update.mock.calls[0];
      expect(ref.path).toBe('loans/loan-1');
      expect(data.isDeleted).toBe(true);
    });

    it('should block deleting a formal loan that still has linked transactions', async () => {
      queueGetDoc(formalLoan());
      const { getDocs } = await import('@angular/fire/firestore');
      (getDocs as any).mockResolvedValueOnce({ docs: [{}], empty: false, size: 1 });

      await expect(service.softDelete('formal-1')).rejects.toThrow('Cannot delete a formal loan');
    });
  });
});
