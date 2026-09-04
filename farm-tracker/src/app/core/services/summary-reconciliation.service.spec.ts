/**
 * Tests for SummaryReconciliationService — the integrity backstop that rebuilds
 * summaries, counterparty counters and animal cost ledgers from raw transactions.
 */

/** In-memory Firestore: collection path → docs (each doc carries its own `id`). */
const store: Record<string, any[]> = {};

vi.mock('@angular/fire/firestore', () => {
  const batch = { set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) };
  return {
    Firestore: class {},
    collection: vi.fn((_fs: any, path: string) => ({ path })),
    doc: vi.fn((_fs: any, coll: string, id: string) => ({ id, path: `${coll}/${id}` })),
    // query() returns the collection so getDocs can look it up; reconciliation only
    // ever filters transactions on isDeleted, which the mock applies itself.
    query: vi.fn((col: any) => col),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    startAfter: vi.fn(),
    getDocs: vi.fn(async (col: any) => {
      let items = store[col.path] || [];
      if (col.path === 'transactions') items = items.filter(t => !t.isDeleted);
      const docs = items.map(d => ({ id: d.id, data: () => d, ref: { path: `${col.path}/${d.id}` } }));
      return { docs, empty: docs.length === 0, size: docs.length };
    }),
    setDoc: vi.fn(),
    writeBatch: vi.fn(() => batch),
    serverTimestamp: vi.fn(() => 'SERVER_TS'),
    Timestamp: {
      fromMillis: (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) }),
      fromDate: (d: Date) => ({ toMillis: () => d.getTime(), toDate: () => d }),
      now: () => ({ toMillis: () => Date.now(), toDate: () => new Date() }),
    },
    QueryDocumentSnapshot: class {},
  };
});

vi.mock('@angular/core', async () => {
  const actual = await vi.importActual('@angular/core');
  return { ...(actual as any), inject: vi.fn(() => ({})) };
});

import { SummaryReconciliationService } from './summary-reconciliation.service';
import { writeBatch } from '@angular/fire/firestore';

const ts = (iso: string) => {
  const d = new Date(iso);
  return { toDate: () => d, toMillis: () => d.getTime() };
};

const txn = (overrides: Record<string, any> = {}) => ({
  id: 'txn-1', type: 'expense', amount: 1000, category: 'feed', categoryName: 'Feed',
  segment: 'seg1', segmentName: 'Goats', paidBy: 'uid-1', paidByName: 'Kiran', createdBy: 'uid-1',
  date: ts('2026-03-15'), month: '2026-03', year: 2026, isDeleted: false, createdAt: ts('2026-03-15'),
  ...overrides,
});

describe('SummaryReconciliationService', () => {
  let service: SummaryReconciliationService;

  function getBatch() {
    return (writeBatch as any).mock.results.slice(-1)[0]?.value;
  }

  function batchSets(prefix: string): any[][] {
    return getBatch().set.mock.calls.filter((c: any[]) => c[0].path.startsWith(prefix));
  }

  beforeEach(() => {
    service = new SummaryReconciliationService();
    vi.clearAllMocks();
    for (const k of Object.keys(store)) delete store[k];
    store['monthlySummaries'] = [];
    store['yearlySummaries'] = [];
    store['buyers'] = [];
    store['suppliers'] = [];
    store['animals'] = [];
  });

  // ──────────── reconcileAll ────────────

  describe('reconcileAll', () => {
    it('should rebuild monthly and yearly summaries with settled-cash person maps and pending counters', async () => {
      store['transactions'] = [
        txn(),
        txn({ id: 'txn-2', type: 'income', amount: 5000, category: 'goat-sales', categoryName: 'Goat Sales', paymentStatus: 'pending', amountReceived: 2000 }),
        txn({ id: 'txn-3', amount: 700, isDeleted: true }),
      ];

      const report = await service.reconcileAll();

      expect(report).toMatchObject({ totalTransactions: 2, monthlySummariesWritten: 1, yearlySummariesWritten: 1, monthlyCorrected: 1, yearlyCorrected: 1 });
      const [ref, monthly] = batchSets('monthlySummaries/')[0];
      expect(ref.path).toBe('monthlySummaries/2026-03-seg1');
      expect(monthly).toMatchObject({
        month: '2026-03', year: 2026, segment: 'seg1',
        totalExpense: 1000, totalIncome: 5000, netProfit: 4000,
        expenseByCategory: { Feed: 1000 }, expenseByCategoryId: { feed: 1000 },
        incomeBySource: { 'Goat Sales': 5000 }, incomeBySourceId: { 'goat-sales': 5000 },
        expenseByPerson: { 'uid-1': 1000 }, incomeByPerson: { 'uid-1': 2000 },
        pendingIncome: 3000, pendingExpense: 0, totalDistributed: 0,
      });
      expect(batchSets('yearlySummaries/')[0][0].path).toBe('yearlySummaries/2026-seg1');
      expect(batchSets('yearlySummaries/')[0][1].month).toBeUndefined();
    });

    it('should report zero corrections when the stored totals already match', async () => {
      store['transactions'] = [txn()];
      store['monthlySummaries'] = [{ id: '2026-03-seg1', totalExpense: 1000, totalIncome: 0, netProfit: -1000 }];
      store['yearlySummaries'] = [{ id: '2026-seg1', totalExpense: 1000, totalIncome: 0, netProfit: -1000 }];

      const report = await service.reconcileAll();

      expect(report.monthlyCorrected).toBe(0);
      expect(report.yearlyCorrected).toBe(0);
    });

    it('should bucket a blank category as "uncategorized" instead of failing the batch', async () => {
      store['transactions'] = [txn({ category: '', categoryName: '' })];

      await service.reconcileAll();

      const monthly = batchSets('monthlySummaries/')[0][1];
      expect(monthly.expenseByCategoryId).toEqual({ uncategorized: 1000 });
      expect(monthly.expenseByCategory).toEqual({ Uncategorized: 1000 });
    });

    it('should delete summary docs that no longer have transactions', async () => {
      store['transactions'] = [txn()];
      store['monthlySummaries'] = [{ id: '2025-12-seg1', totalExpense: 50 }];

      const report = await service.reconcileAll();

      expect(getBatch().delete).toHaveBeenCalledWith(expect.objectContaining({ path: 'monthlySummaries/2025-12-seg1' }));
      expect(report.monthlyCorrected).toBe(2); // 1 rebuilt + 1 orphan removed
    });

    it('should credit distributions to each partner', async () => {
      store['transactions'] = [txn({ type: 'income', amount: 6000, distributions: [{ uid: 'uid-1', name: 'Kiran', amount: 4000 }, { uid: 'reinvestment', name: 'Reinvestment', amount: 2000 }] })];

      await service.reconcileAll();

      expect(batchSets('monthlySummaries/')[0][1]).toMatchObject({ totalDistributed: 6000, distributionByPerson: { 'uid-1': 4000, reinvestment: 2000 } });
    });
  });

  // ──────────── reconcileCounterparties ────────────

  describe('reconcileCounterparties', () => {
    it('should rewrite drifted buyer counters (units = quantity || 1) and leave accurate ones alone', async () => {
      store['transactions'] = [
        txn({ id: 's1', type: 'income', amount: 9000, quantity: 3, linkedBuyerId: 'b1', date: ts('2026-03-10') }),
        txn({ id: 's2', type: 'income', amount: 2000, linkedBuyerId: 'b1', segment: 'seg2', date: ts('2026-04-01') }),
      ];
      store['buyers'] = [
        { id: 'b1', name: 'Ali', isDeleted: false, totalPurchases: 1, totalAmountPaid: 9000 },
        { id: 'b2', name: 'Bo', isDeleted: false, totalPurchases: 0, totalAmountPaid: 0, averageRate: 0, purchasesBySegment: {}, amountBySegment: {} },
      ];

      const report = await service.reconcileCounterparties();

      expect(report).toMatchObject({ buyersChecked: 2, buyersCorrected: 1, suppliersChecked: 0, suppliersCorrected: 0 });
      const [ref, data] = getBatch().update.mock.calls[0];
      expect(ref.path).toBe('buyers/b1');
      expect(data).toMatchObject({
        totalPurchases: 4, totalAmountPaid: 11000, averageRate: 2750,
        purchasesBySegment: { seg1: 3, seg2: 1 }, amountBySegment: { seg1: 9000, seg2: 2000 },
      });
      expect(data.lastPurchaseDate.toMillis()).toBe(new Date('2026-04-01').getTime());
    });

    it('should count one supplier order per transaction, sum remaining credit, and skip loan-funded expenses', async () => {
      store['transactions'] = [
        txn({ id: 'p1', amount: 4000, quantity: 10, linkedSupplierId: 's1', expensePaymentStatus: 'pending', amountPaid: 1500 }),
        txn({ id: 'p2', amount: 1000, linkedSupplierId: 's1', linkedLoanId: 'loan-1' }),
      ];
      store['suppliers'] = [{ id: 's1', name: 'Agro', isDeleted: false, totalOrders: 0, totalAmountPaid: 0, pendingAmount: 0 }];

      const report = await service.reconcileCounterparties();

      expect(report.suppliersCorrected).toBe(1);
      expect(getBatch().update.mock.calls[0][1]).toMatchObject({ totalOrders: 1, totalAmountPaid: 4000, pendingAmount: 2500, ordersBySegment: { seg1: 1 } });
    });
  });

  // ──────────── reconcileAnimalCosts ────────────

  describe('reconcileAnimalCosts', () => {
    it('should rebuild a drifted ledger from linked expenses, excluding the purchase expense and income', async () => {
      store['transactions'] = [
        txn({ id: 'p1', amount: 5000, tags: ['animal-purchase'], linkedAnimalIds: ['a1'] }),
        txn({ id: 'f1', amount: 900, linkedAnimalIds: ['a1', 'a2'], animalCostSplit: { a1: 600, a2: 300 }, date: ts('2026-03-10') }),
        txn({ id: 'm1', amount: 200, category: 'medicine', categoryName: 'Medicine', linkedAnimalIds: ['a1'], date: ts('2026-03-20') }),
        txn({ id: 'gone', amount: 999, linkedAnimalIds: ['a1'], isDeleted: true }),
        txn({ id: 'sale', type: 'income', amount: 12000, linkedAnimalIds: ['a1'] }),
      ];
      store['animals'] = [
        { id: 'a1', isDeleted: false, purchasePrice: 5000, purchaseTransactionId: 'p1', status: 'sold', salePrice: 12000,
          costEntries: [{ transactionId: 'f1', amount: 600 }, { transactionId: 'gone', amount: 999 }], totalCosts: 1599, totalInvested: 6599, profit: 5401, profitMargin: 81.85 },
        { id: 'a2', isDeleted: false, purchasePrice: 0, status: 'active',
          costEntries: [{ transactionId: 'f1', amount: 300 }], totalCosts: 300, totalInvested: 300 },
        { id: 'a3', isDeleted: true, purchasePrice: 0, status: 'active', costEntries: [{ transactionId: 'x', amount: 1 }], totalCosts: 1, totalInvested: 1 },
      ];

      const report = await service.reconcileAnimalCosts();

      expect(report).toMatchObject({ totalTransactions: 4, linkedTransactions: 3, animalsChecked: 2, animalsCorrected: 1 });
      const updates = getBatch().update.mock.calls;
      expect(updates).toHaveLength(1);
      const [ref, data] = updates[0];
      expect(ref.path).toBe('animals/a1');
      expect(data.costEntries.map((e: any) => [e.transactionId, e.amount])).toEqual([['f1', 600], ['m1', 200]]);
      expect(data).toMatchObject({ totalCosts: 800, totalInvested: 5800, profit: 6200, profitMargin: 106.9 });
    });

    it('should report zero corrections on a clean ledger', async () => {
      store['transactions'] = [txn({ id: 'f1', amount: 900, linkedAnimalIds: ['a1'] })];
      store['animals'] = [{ id: 'a1', isDeleted: false, purchasePrice: 100, status: 'active', costEntries: [{ transactionId: 'f1', amount: 900 }], totalCosts: 900, totalInvested: 1000 }];

      const report = await service.reconcileAnimalCosts();

      expect(report.animalsCorrected).toBe(0);
      expect(writeBatch).not.toHaveBeenCalled();
    });

    it('should clear a ledger whose transactions were all deleted', async () => {
      store['transactions'] = [txn({ id: 'f1', amount: 900, linkedAnimalIds: ['a1'], isDeleted: true })];
      store['animals'] = [{ id: 'a1', isDeleted: false, purchasePrice: 100, status: 'active', costEntries: [{ transactionId: 'f1', amount: 900 }], totalCosts: 900, totalInvested: 1000 }];

      const report = await service.reconcileAnimalCosts();

      expect(report.animalsCorrected).toBe(1);
      expect(getBatch().update.mock.calls[0][1]).toMatchObject({ costEntries: [], totalCosts: 0, totalInvested: 100 });
    });
  });
});
