/**
 * Tests for the pure animal-cost rules shared by the write path and the reconciler.
 */

vi.mock('@angular/fire/firestore', () => ({ Timestamp: class {} }));

import {
  animalProfitFields,
  costFieldsFromEntries,
  daysActive,
  computeCostSplits,
  isAttributableCost,
  costEntryFor,
  rebuildCostEntries,
  costEntriesDiffer,
} from './animal-cost.utils';

const ts = (iso: string) => {
  const d = new Date(iso);
  return { toDate: () => d, toMillis: () => d.getTime() } as any;
};

const txn = (overrides: Record<string, any> = {}) => ({
  id: 'txn-1', type: 'expense', isDeleted: false, amount: 3000,
  category: 'feed', categoryName: 'Feed', description: 'Monthly feed',
  date: ts('2026-03-15'), linkedAnimalIds: ['a1', 'a2'],
  ...overrides,
}) as any;

describe('animalProfitFields', () => {
  it('computes profit and a 2dp margin', () => {
    expect(animalProfitFields(9000, 6000)).toEqual({ profit: 3000, profitMargin: 50 });
    expect(animalProfitFields(5000, 6000)).toEqual({ profit: -1000, profitMargin: -16.67 });
  });

  it('reports a 0 margin when nothing was invested', () => {
    expect(animalProfitFields(1000, 0)).toEqual({ profit: 1000, profitMargin: 0 });
  });
});

describe('costFieldsFromEntries', () => {
  it('sums entries onto the purchase price', () => {
    const fields = costFieldsFromEntries({ purchasePrice: 5000, status: 'active' } as any, [
      { transactionId: 't1', amount: 100.005 } as any,
      { transactionId: 't2', amount: 200 } as any,
    ]);
    expect(fields.totalCosts).toBe(300.01);
    expect(fields.totalInvested).toBe(5300.01);
    expect(fields.profit).toBeUndefined();
  });

  it('adds profit only for sold animals with a sale price', () => {
    const sold = costFieldsFromEntries({ purchasePrice: 5000, status: 'sold', salePrice: 8000 } as any, [
      { transactionId: 't1', amount: 1000 } as any,
    ]);
    expect(sold).toMatchObject({ totalInvested: 6000, profit: 2000, profitMargin: 33.33 });

    const dead = costFieldsFromEntries({ purchasePrice: 5000, status: 'dead', salePrice: 8000 } as any, []);
    expect(dead.profit).toBeUndefined();
  });
});

describe('daysActive', () => {
  it('counts whole days from origin, minimum 1', () => {
    expect(daysActive(ts('2026-01-01'), new Date('2026-01-11'))).toBe(10);
    expect(daysActive(ts('2026-01-11'), new Date('2026-01-11'))).toBe(1);
    expect(daysActive(ts('2026-02-01'), new Date('2026-01-11'))).toBe(1);
    expect(daysActive(undefined, new Date('2026-01-11'))).toBe(1);
  });
});

describe('computeCostSplits', () => {
  const animals = [
    { id: 'a1', originDate: ts('2026-01-01') },
    { id: 'a2', originDate: ts('2026-03-01') },
    { id: 'a3', originDate: ts('2026-03-10') },
  ] as any[];

  it('splits equally and gives the last animal the rounding remainder', () => {
    const splits = computeCostSplits(animals, 100, 'equal', new Date('2026-03-15'));
    expect(splits).toEqual({ a1: 33.33, a2: 33.33, a3: 33.34 });
    expect(Object.values(splits).reduce((s, v) => s + v, 0)).toBeCloseTo(100, 2);
  });

  it('weights by days active', () => {
    // days: a1 = 73, a2 = 14, a3 = 5 → total 92
    const splits = computeCostSplits(animals, 920, 'by_days', new Date('2026-03-15'));
    expect(splits).toEqual({ a1: 730, a2: 140, a3: 50 });
  });

  it('passes custom amounts through and zero-fills missing ones', () => {
    expect(computeCostSplits(animals, 100, 'custom', new Date(), { a1: 60, a3: 40.004 }))
      .toEqual({ a1: 60, a2: 0, a3: 40 });
  });

  it('returns an empty map for no animals', () => {
    expect(computeCostSplits([], 100, 'equal', new Date())).toEqual({});
  });
});

describe('isAttributableCost', () => {
  it('accepts a live expense', () => {
    expect(isAttributableCost(txn(), {})).toBe(true);
  });

  it('rejects income, deleted docs, and the purchase expense', () => {
    expect(isAttributableCost(txn({ type: 'income' }), {})).toBe(false);
    expect(isAttributableCost(txn({ isDeleted: true }), {})).toBe(false);
    expect(isAttributableCost(txn({ id: 'p1' }), { purchaseTransactionId: 'p1' })).toBe(false);
    expect(isAttributableCost(txn({ tags: ['animal-purchase'] }), {})).toBe(false);
  });
});

describe('costEntryFor', () => {
  it('uses the stored split when present', () => {
    const entry = costEntryFor(txn({ animalCostSplit: { a1: 2000, a2: 1000 } }), { id: 'a2' });
    expect(entry).toMatchObject({ transactionId: 'txn-1', amount: 1000, category: 'feed', categoryName: 'Feed', description: 'Monthly feed' });
  });

  it('falls back to an equal split when no split map is stored', () => {
    expect(costEntryFor(txn(), { id: 'a1' })!.amount).toBe(1500);
  });

  it('returns null for animals the txn does not name, zero shares, or non-attributable txns', () => {
    expect(costEntryFor(txn(), { id: 'a9' })).toBeNull();
    expect(costEntryFor(txn({ animalCostSplit: { a1: 3000, a2: 0 } }), { id: 'a2' })).toBeNull();
    expect(costEntryFor(txn({ tags: ['animal-purchase'] }), { id: 'a1' })).toBeNull();
  });

  it('omits description when the txn has none (Firestore rejects undefined)', () => {
    const entry = costEntryFor(txn({ description: '' }), { id: 'a1' })!;
    expect('description' in entry).toBe(false);
  });
});

describe('rebuildCostEntries', () => {
  it('collects every attributable entry in date order', () => {
    const entries = rebuildCostEntries({ id: 'a1', purchaseTransactionId: 'p1' }, [
      txn({ id: 'p1', date: ts('2026-01-01'), linkedAnimalIds: ['a1'], amount: 5000 }),
      txn({ id: 't2', date: ts('2026-03-20'), amount: 400, linkedAnimalIds: ['a1'] }),
      txn({ id: 't1', date: ts('2026-03-10'), amount: 600, linkedAnimalIds: ['a1', 'a2'], animalCostSplit: { a1: 500, a2: 100 } }),
      txn({ id: 't3', type: 'income', linkedAnimalIds: ['a1'] }),
    ]);
    expect(entries.map(e => [e.transactionId, e.amount])).toEqual([['t1', 500], ['t2', 400]]);
  });
});

describe('costEntriesDiffer', () => {
  const stored = [{ transactionId: 't1', amount: 500 }, { transactionId: 't2', amount: 400 }] as any[];

  it('ignores order and description', () => {
    const rebuilt = [{ transactionId: 't2', amount: 400, description: 'x' }, { transactionId: 't1', amount: 500 }] as any[];
    expect(costEntriesDiffer(stored, rebuilt)).toBe(false);
  });

  it('detects amount and membership changes', () => {
    expect(costEntriesDiffer(stored, [{ transactionId: 't1', amount: 500 }] as any[])).toBe(true);
    expect(costEntriesDiffer(stored, [{ transactionId: 't1', amount: 501 }, { transactionId: 't2', amount: 400 }] as any[])).toBe(true);
    expect(costEntriesDiffer(undefined, [])).toBe(false);
  });
});
