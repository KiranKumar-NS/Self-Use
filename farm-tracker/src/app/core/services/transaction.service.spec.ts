/**
 * Tests for TransactionService business logic.
 */

const mockGetDocResults: any[] = [];

vi.mock('@angular/fire/firestore', () => {
  const batchMethods = {
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  };
  return {
    Firestore: class {},
    collection: vi.fn((_fs: any, path: string) => ({ path })),
    doc: vi.fn((...args: any[]) => ({
      id: args.length > 2 ? args[2] : 'new-txn-id',
      path: args.length > 2 ? `${args[1]}/${args[2]}` : 'transactions/new-txn-id',
    })),
    getDocs: vi.fn().mockResolvedValue({ docs: [], empty: true, size: 0 }),
    getDoc: vi.fn(async () => {
      if (mockGetDocResults.length > 0) return mockGetDocResults.shift();
      return { exists: () => false, data: () => undefined };
    }),
    query: vi.fn(),
    orderBy: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    startAfter: vi.fn(),
    writeBatch: vi.fn(() => batchMethods),
    deleteDoc: vi.fn(),
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

vi.mock('@angular/fire/auth', () => ({
  Auth: class {},
  onAuthStateChanged: vi.fn(),
}));

vi.mock('@angular/core', async () => {
  const actual = await vi.importActual('@angular/core');
  return {
    ...actual as any,
    inject: vi.fn(() => ({
      userProfile: () => ({ uid: 'test-uid', displayName: 'Test User' }),
    })),
  };
});

import { TransactionService } from './transaction.service';
import { writeBatch, increment } from '@angular/fire/firestore';

describe('TransactionService', () => {
  let service: TransactionService;

  function getBatch() {
    return (writeBatch as any).mock.results.slice(-1)[0]?.value;
  }

  function queueGetDoc(data: any) {
    mockGetDocResults.push({
      exists: () => true,
      data: () => data,
    });
  }

  beforeEach(() => {
    service = new TransactionService();
    vi.clearAllMocks();
    mockGetDocResults.length = 0;
  });

  const baseExpenseData = {
    type: 'expense' as const,
    date: new Date('2026-03-15'),
    amount: 1000,
    category: 'cat-feed',
    categoryName: 'Feed',
    segment: 'seg1',
    segmentName: 'Goats',
    description: 'Monthly feed',
    paymentMethod: 'cash' as const,
    month: '2026-03',
    year: 2026,
  };

  const baseIncomeData = {
    ...baseExpenseData,
    type: 'income' as const,
    category: 'cat-milk',
    categoryName: 'Milk Sale',
    amount: 5000,
  };

  // ──────────── create ────────────

  describe('create', () => {
    it('should create expense with correct fields', async () => {
      await service.create(baseExpenseData);

      const batch = getBatch();
      expect(batch.set).toHaveBeenCalledTimes(3); // txn + monthly + yearly
      const txnDoc = batch.set.mock.calls[0][1];
      expect(txnDoc.type).toBe('expense');
      expect(txnDoc.amount).toBe(1000);
      expect(txnDoc.isDeleted).toBe(false);
    });

    it('should update monthly and yearly summaries', async () => {
      await service.create(baseExpenseData);

      const batch = getBatch();
      // Monthly summary
      const monthlySummary = batch.set.mock.calls[1][1];
      expect(monthlySummary.totalExpense).toBeDefined();
      expect(monthlySummary.netProfit).toBeDefined();
      expect(monthlySummary.month).toBe('2026-03');

      // Yearly summary
      const yearlySummary = batch.set.mock.calls[2][1];
      expect(yearlySummary.totalExpense).toBeDefined();
      expect(yearlySummary.year).toBe(2026);
    });

    it('should set income payment status', async () => {
      await service.create(baseIncomeData);

      const batch = getBatch();
      const txnDoc = batch.set.mock.calls[0][1];
      expect(txnDoc.paymentStatus).toBe('received');
    });

    it('should track pending income in summaries', async () => {
      await service.create({ ...baseIncomeData, paymentStatus: 'pending' as any });

      const batch = getBatch();
      const monthlySummary = batch.set.mock.calls[1][1];
      expect(monthlySummary.pendingIncome).toBeDefined();
    });

    it('should track pending expense in summaries', async () => {
      await service.create({ ...baseExpenseData, expensePaymentStatus: 'pending' as any });

      const batch = getBatch();
      const monthlySummary = batch.set.mock.calls[1][1];
      expect(monthlySummary.pendingExpense).toBeDefined();
    });

    it('should include animal links when provided', async () => {
      await service.create({
        ...baseExpenseData,
        linkedAnimalIds: ['a1', 'a2'],
        linkedAnimalNames: ['Raju', 'Kalu'],
        animalCostSplit: { a1: 500, a2: 500 },
      });

      const batch = getBatch();
      const txnDoc = batch.set.mock.calls[0][1];
      expect(txnDoc.linkedAnimalIds).toEqual(['a1', 'a2']);
      expect(txnDoc.animalCostSplit).toEqual({ a1: 500, a2: 500 });
    });

    it('should include tags when provided', async () => {
      await service.create({ ...baseExpenseData, tags: ['vaccination'] });

      const batch = getBatch();
      const txnDoc = batch.set.mock.calls[0][1];
      expect(txnDoc.tags).toEqual(['vaccination']);
    });

    it('should track per-person expenses', async () => {
      await service.create({ ...baseExpenseData, paidBy: 'other', paidByName: 'Raju Sharma' });

      const batch = getBatch();
      const monthlySummary = batch.set.mock.calls[1][1];
      // person key should be sanitized title-case
      expect(monthlySummary['expenseByPerson.Raju Sharma']).toBeDefined();
    });

    it('should sanitize person name with special chars', async () => {
      await service.create({ ...baseExpenseData, paidBy: 'other', paidByName: 'name.with/dots' });

      const batch = getBatch();
      const monthlySummary = batch.set.mock.calls[1][1];
      // dots and slashes should be replaced with _
      expect(monthlySummary['expenseByPerson.Name_with_dots']).toBeDefined();
    });
  });

  // ──────────── update ────────────

  describe('update', () => {
    it('should throw for linked loan transactions', async () => {
      queueGetDoc({
        ...baseExpenseData, linkedLoanId: 'loan-1',
        isDeleted: false, createdBy: 'test-uid', timeline: [],
        date: { toDate: () => new Date() },
      });

      await expect(service.update('txn-1', baseExpenseData))
        .rejects.toThrow('linked to a loan');
    });
  });

  // ──────────── getAll ────────────

  describe('getAll', () => {
    it('should return transactions', async () => {
      const { getDocs } = await import('@angular/fire/firestore');
      (getDocs as any).mockResolvedValueOnce({
        docs: [
          { data: () => ({ id: 'txn-1', isDeleted: false }), id: 'txn-1' },
          { data: () => ({ id: 'txn-2', isDeleted: false }), id: 'txn-2' },
        ],
        empty: false,
        size: 2,
      });

      const result = await service.getAll();
      expect(result.transactions).toHaveLength(2);
    });
  });
});
