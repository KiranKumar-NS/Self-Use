/**
 * Tests for TransactionService business logic.
 */

const mockGetDocResults: any[] = [];
const mockTxnCaptures: any[] = [];
// Shared object returned by the mocked inject() for every injected service
// (AuthService, SummaryService, BuyerService, ...)
const mockInjected = {
  userProfile: () => ({ uid: 'test-uid', displayName: 'Test User' }),
  requireUser: () => ({ uid: 'test-uid', displayName: 'Test User' }),
  clearCache: () => undefined,
  updateStats: undefined as any, // assigned per-test via vi.fn()
};

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
    inject: vi.fn(() => mockInjected),
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
    mockTxnCaptures.length = 0;
    mockInjected.updateStats = vi.fn().mockResolvedValue(undefined);
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

    it('should include sale link when provided', async () => {
      await service.create({
        ...baseExpenseData,
        linkedSaleTransactionId: 'sale-1',
        linkedSaleLabel: '19 Jul 2026 — Goat Sales ₹45,000',
      });

      const batch = getBatch();
      const txnDoc = batch.set.mock.calls[0][1];
      expect(txnDoc.linkedSaleTransactionId).toBe('sale-1');
      expect(txnDoc.linkedSaleLabel).toBe('19 Jul 2026 — Goat Sales ₹45,000');
    });

    it('should omit sale link when not provided', async () => {
      await service.create(baseExpenseData);

      const batch = getBatch();
      const txnDoc = batch.set.mock.calls[0][1];
      expect(txnDoc.linkedSaleTransactionId).toBeUndefined();
    });

    it('should update buyer stats for income with linked buyer', async () => {
      await service.create({
        ...baseIncomeData,
        quantity: 5,
        linkedBuyerId: 'buyer-1',
        linkedBuyerName: 'Rahim Traders',
      });

      expect(mockInjected.updateStats).toHaveBeenCalledWith(
        'buyer-1', 5000, 5, baseIncomeData.date, 'seg1'
      );
    });

    it('should not update buyer stats without a linked buyer', async () => {
      await service.create(baseIncomeData);
      expect(mockInjected.updateStats).not.toHaveBeenCalled();
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
    const oldExpenseDoc = {
      ...baseExpenseData,
      isDeleted: false, createdBy: 'test-uid', timeline: [],
      date: { toDate: () => new Date() },
    };

    it('should throw for linked loan transactions', async () => {
      queueGetDoc({ ...oldExpenseDoc, linkedLoanId: 'loan-1' });

      await expect(service.update('txn-1', baseExpenseData))
        .rejects.toThrow('linked to a loan');
    });

    it('should store sale link and record the change in timeline', async () => {
      queueGetDoc(oldExpenseDoc);

      await service.update('txn-1', {
        ...baseExpenseData,
        linkedSaleTransactionId: 'sale-1',
        linkedSaleLabel: '19 Jul 2026 — Goat Sales ₹45,000',
      });

      const txn = mockTxnCaptures.slice(-1)[0];
      const updates = txn.update.mock.calls[0][1];
      expect(updates.linkedSaleTransactionId).toBe('sale-1');
      expect(updates.linkedSaleLabel).toBe('19 Jul 2026 — Goat Sales ₹45,000');
      const lastEntry = updates.timeline[updates.timeline.length - 1];
      expect(lastEntry.changes).toContain('linked sale: none→19 Jul 2026 — Goat Sales ₹45,000');
    });

    it('should null the sale link when type changes to income', async () => {
      queueGetDoc({
        ...oldExpenseDoc,
        linkedSaleTransactionId: 'sale-1',
        linkedSaleLabel: 'old label',
      });

      await service.update('txn-1', { ...baseIncomeData });

      const txn = mockTxnCaptures.slice(-1)[0];
      const updates = txn.update.mock.calls[0][1];
      expect(updates.linkedSaleTransactionId).toBeNull();
      expect(updates.linkedSaleLabel).toBeNull();
    });

    it('should reverse old buyer stats and apply new on amount change', async () => {
      queueGetDoc({
        ...baseIncomeData, isDeleted: false, createdBy: 'test-uid', timeline: [],
        date: { toDate: () => new Date() },
        linkedBuyerId: 'buyer-1', quantity: 5,
      });

      await service.update('txn-1', {
        ...baseIncomeData, amount: 6000, quantity: 5,
        linkedBuyerId: 'buyer-1', linkedBuyerName: 'Rahim Traders',
      });

      expect(mockInjected.updateStats).toHaveBeenCalledWith('buyer-1', -5000, -5, null, 'seg1');
      expect(mockInjected.updateStats).toHaveBeenCalledWith('buyer-1', 6000, 5, baseIncomeData.date, 'seg1');
    });

    it('should skip buyer stats when contribution is unchanged', async () => {
      queueGetDoc({
        ...baseIncomeData, isDeleted: false, createdBy: 'test-uid', timeline: [],
        date: { toDate: () => new Date() },
        linkedBuyerId: 'buyer-1',
      });

      await service.update('txn-1', {
        ...baseIncomeData,
        description: 'reworded only',
        linkedBuyerId: 'buyer-1', linkedBuyerName: 'Rahim Traders',
      });

      expect(mockInjected.updateStats).not.toHaveBeenCalled();
    });
  });

  // ──────────── softDelete ────────────

  describe('softDelete', () => {
    it('should reverse buyer stats when deleting buyer-linked income', async () => {
      queueGetDoc({
        ...baseIncomeData, isDeleted: false, createdBy: 'test-uid', timeline: [],
        date: { toDate: () => new Date() },
        linkedBuyerId: 'buyer-1', quantity: 5,
      });

      await service.softDelete('txn-1');

      expect(mockInjected.updateStats).toHaveBeenCalledWith('buyer-1', -5000, -5, null, 'seg1');
    });
  });

  // ──────────── updateDistribution ────────────

  describe('updateDistribution', () => {
    function queueLinkedExpenses(amounts: number[]) {
      // getLinkedSellingExpenses runs a getDocs query before the transaction
      return import('@angular/fire/firestore').then(({ getDocs }) => {
        (getDocs as any).mockResolvedValueOnce({
          docs: amounts.map(amount => ({ data: () => ({ type: 'expense', amount, isDeleted: false }) })),
          empty: amounts.length === 0,
          size: amounts.length,
        });
      });
    }

    it('should reject distribution exceeding net realization', async () => {
      await queueLinkedExpenses([3750]);
      queueGetDoc({
        ...baseIncomeData, amount: 45000, isDeleted: false, timeline: [],
        distributions: [], date: { toDate: () => new Date() },
      });

      await expect(service.updateDistribution('sale-1', [{ uid: 'u1', name: 'A', amount: 42000 }]))
        .rejects.toThrow('net realization');
    });

    it('should allow distribution up to net realization', async () => {
      await queueLinkedExpenses([3750]);
      queueGetDoc({
        ...baseIncomeData, amount: 45000, isDeleted: false, timeline: [],
        distributions: [], date: { toDate: () => new Date() },
      });

      await service.updateDistribution('sale-1', [{ uid: 'u1', name: 'A', amount: 41250 }]);

      const txn = mockTxnCaptures.slice(-1)[0];
      const updates = txn.update.mock.calls[0][1];
      expect(updates.distributions).toEqual([{ uid: 'u1', name: 'A', amount: 41250 }]);
    });
  });

  // ──────────── getLinkedSellingExpenses ────────────

  describe('getLinkedSellingExpenses', () => {
    it('should return only expense transactions', async () => {
      const { getDocs } = await import('@angular/fire/firestore');
      (getDocs as any).mockResolvedValueOnce({
        docs: [
          { data: () => ({ id: 'e1', type: 'expense', amount: 800 }) },
          { data: () => ({ id: 'i1', type: 'income', amount: 500 }) },
        ],
        empty: false,
        size: 2,
      });

      const result = await service.getLinkedSellingExpenses('sale-1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('e1');
    });
  });

  // ──────────── saleLabel ────────────

  describe('saleLabel', () => {
    it('should format date, category, amount and buyer', () => {
      const label = service.saleLabel({
        date: { toDate: () => new Date('2026-07-19') } as any,
        categoryName: 'Goat Sales',
        amount: 45000,
        linkedBuyerName: 'Rahim Traders',
      });
      expect(label).toContain('Goat Sales');
      expect(label).toContain('₹45,000');
      expect(label).toContain('(Rahim Traders)');
    });

    it('should omit buyer suffix when absent', () => {
      const label = service.saleLabel({
        date: { toDate: () => new Date('2026-07-19') } as any,
        categoryName: 'Crop Sales',
        amount: 12000,
      });
      expect(label).not.toContain('(');
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
