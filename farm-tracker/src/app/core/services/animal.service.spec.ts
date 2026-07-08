/**
 * Tests for AnimalService business logic.
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
      id: args.length > 2 ? args[2] : 'new-animal-id',
      path: args.length > 2 ? `${args[1]}/${args[2]}` : 'animals/new-animal-id',
    })),
    getDocs: vi.fn().mockResolvedValue({ docs: [], empty: true }),
    getDoc: vi.fn(async (ref: any) => {
      if (mockGetDocResults.length > 0) {
        const result = mockGetDocResults.shift();
        result.id = ref?.id ?? result.id;
        return result;
      }
      return { id: ref?.id, exists: () => false, data: () => undefined };
    }),
    query: vi.fn(),
    orderBy: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    writeBatch: vi.fn(() => batchMethods),
    serverTimestamp: vi.fn(() => 'SERVER_TS'),
    Timestamp: {
      fromDate: (d: Date) => ({ toDate: () => d, toMillis: () => d.getTime() }),
      now: () => ({ toDate: () => new Date(), toMillis: () => Date.now() }),
    },
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
      requireUser: () => ({ uid: 'test-uid', displayName: 'Test User' }),
    })),
  };
});

import { AnimalService } from './animal.service';
import { writeBatch } from '@angular/fire/firestore';

describe('AnimalService', () => {
  let service: AnimalService;

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
    service = new AnimalService();
    vi.clearAllMocks();
    mockGetDocResults.length = 0;
  });

  // ──────────── create ────────────

  describe('create', () => {
    it('should set purchasePricePerHead equal to purchasePrice for individual', async () => {
      await service.create({
        segment: 'seg1', segmentName: 'Goats', trackingMode: 'individual',
        batchSize: 1, origin: 'purchase', originDate: new Date('2026-01-15'),
        purchasePrice: 5000,
      });

      const batch = getBatch();
      const setCall = batch.set.mock.calls[0][1];
      expect(setCall.purchasePrice).toBe(5000);
      expect(setCall.purchasePricePerHead).toBe(5000);
      expect(setCall.totalInvested).toBe(5000);
      expect(setCall.batchSize).toBe(1);
      expect(setCall.currentCount).toBe(1);
      expect(setCall.status).toBe('active');
    });

    it('should calculate purchasePricePerHead for batch', async () => {
      await service.create({
        segment: 'seg1', segmentName: 'Goats', trackingMode: 'batch',
        batchSize: 5, origin: 'purchase', originDate: new Date('2026-01-15'),
        purchasePrice: 25000,
      });

      const batch = getBatch();
      const setCall = batch.set.mock.calls[0][1];
      expect(setCall.purchasePrice).toBe(25000);
      expect(setCall.purchasePricePerHead).toBe(5000);
      expect(setCall.totalInvested).toBe(25000);
    });

    it('should handle zero purchase price', async () => {
      await service.create({
        segment: 'seg1', segmentName: 'Goats', trackingMode: 'individual',
        batchSize: 1, origin: 'birth', originDate: new Date('2026-01-15'),
      });

      const batch = getBatch();
      const setCall = batch.set.mock.calls[0][1];
      expect(setCall.purchasePrice).toBe(0);
      expect(setCall.totalInvested).toBe(0);
    });

    it('should set optional fields only when provided', async () => {
      await service.create({
        segment: 'seg1', segmentName: 'Goats', trackingMode: 'individual',
        batchSize: 1, origin: 'purchase', originDate: new Date('2026-01-15'),
        tag: 'G-001', name: 'Raju', breed: 'Jamunapari', gender: 'male',
      });

      const batch = getBatch();
      const setCall = batch.set.mock.calls[0][1];
      expect(setCall.tag).toBe('G-001');
      expect(setCall.name).toBe('Raju');
      expect(setCall.breed).toBe('Jamunapari');
      expect(setCall.gender).toBe('male');
    });
  });

  // ──────────── attributeCost ────────────

  describe('attributeCost', () => {
    const costData = {
      category: 'cat-feed', categoryName: 'Feed',
      date: new Date('2026-03-15'), totalAmount: 3000,
      description: 'Monthly feed',
    };

    it('should split equally among animals', async () => {
      // Queue 3 getDoc results for each animal
      for (let i = 0; i < 3; i++) {
        queueGetDoc({
          totalCosts: 0, costEntries: [],
          purchasePrice: 5000, totalInvested: 5000,
          status: 'active',
          originDate: { toDate: () => new Date('2026-01-01') },
        });
      }

      await service.attributeCost(['a1', 'a2', 'a3'], 'txn-1', costData, 'equal');

      const batch = getBatch();
      expect(batch.update).toHaveBeenCalledTimes(3);
      const firstUpdate = batch.update.mock.calls[0][1];
      expect(firstUpdate.totalCosts).toBe(1000);
      expect(firstUpdate.totalInvested).toBe(6000);
    });

    it('should use custom splits', async () => {
      queueGetDoc({
        totalCosts: 0, costEntries: [],
        purchasePrice: 5000, totalInvested: 5000,
        status: 'active', originDate: { toDate: () => new Date('2026-01-01') },
      });
      queueGetDoc({
        totalCosts: 0, costEntries: [],
        purchasePrice: 5000, totalInvested: 5000,
        status: 'active', originDate: { toDate: () => new Date('2026-01-01') },
      });

      await service.attributeCost(
        ['a1', 'a2'], 'txn-1', costData, 'custom',
        { a1: 2000, a2: 1000 },
      );

      const batch = getBatch();
      expect(batch.update).toHaveBeenCalledTimes(2);
      const firstUpdate = batch.update.mock.calls[0][1];
      expect(firstUpdate.totalCosts).toBe(2000);
      const secondUpdate = batch.update.mock.calls[1][1];
      expect(secondUpdate.totalCosts).toBe(1000);
    });

    it('should skip animals with zero custom split', async () => {
      queueGetDoc({
        totalCosts: 0, costEntries: [],
        purchasePrice: 5000, totalInvested: 5000,
        status: 'active', originDate: { toDate: () => new Date('2026-01-01') },
      });
      queueGetDoc({
        totalCosts: 0, costEntries: [],
        purchasePrice: 5000, totalInvested: 5000,
        status: 'active', originDate: { toDate: () => new Date('2026-01-01') },
      });

      await service.attributeCost(
        ['a1', 'a2'], 'txn-1', costData, 'custom',
        { a1: 3000, a2: 0 },
      );

      const batch = getBatch();
      expect(batch.update).toHaveBeenCalledTimes(1);
    });

    it('should recalculate profit for sold animals', async () => {
      queueGetDoc({
        totalCosts: 0, costEntries: [],
        purchasePrice: 5000, totalInvested: 5000,
        status: 'sold', salePrice: 8000,
        originDate: { toDate: () => new Date('2026-01-01') },
      });

      await service.attributeCost(['a1'], 'txn-1', costData, 'equal');

      const batch = getBatch();
      const update = batch.update.mock.calls[0][1];
      expect(update.profit).toBe(0); // 8000 - 8000
      expect(update.profitMargin).toBe(0);
    });

    it('should add cost entry to costEntries array', async () => {
      queueGetDoc({
        totalCosts: 0, costEntries: [],
        purchasePrice: 5000, totalInvested: 5000,
        status: 'active', originDate: { toDate: () => new Date('2026-01-01') },
      });

      await service.attributeCost(['a1'], 'txn-1', costData, 'equal');

      const batch = getBatch();
      const update = batch.update.mock.calls[0][1];
      expect(update.costEntries).toHaveLength(1);
      expect(update.costEntries[0].transactionId).toBe('txn-1');
      expect(update.costEntries[0].amount).toBe(3000);
    });
  });

  // ──────────── removeCost ────────────

  describe('removeCost', () => {
    it('should remove matching entries and recalculate totals', async () => {
      queueGetDoc({
        totalCosts: 3000, purchasePrice: 5000, totalInvested: 8000,
        status: 'active',
        costEntries: [
          { transactionId: 'txn-1', amount: 2000 },
          { transactionId: 'txn-2', amount: 1000 },
        ],
      });

      await service.removeCost('a1', 'txn-1');

      const batch = getBatch();
      const update = batch.update.mock.calls[0][1];
      expect(update.costEntries).toHaveLength(1);
      expect(update.totalCosts).toBe(1000);
      expect(update.totalInvested).toBe(6000);
    });

    it('should recalculate profit for sold animals', async () => {
      queueGetDoc({
        totalCosts: 3000, purchasePrice: 5000, totalInvested: 8000,
        status: 'sold', salePrice: 10000,
        costEntries: [{ transactionId: 'txn-1', amount: 3000 }],
      });

      await service.removeCost('a1', 'txn-1');

      const batch = getBatch();
      const update = batch.update.mock.calls[0][1];
      expect(update.profit).toBe(5000);
    });
  });

  // ──────────── recordSale ────────────

  describe('recordSale', () => {
    it('should mark as sold for full sale', async () => {
      queueGetDoc({
        currentCount: 1, totalInvested: 5000, status: 'active',
      });

      await service.recordSale('a1', {
        salePrice: 8000, date: new Date('2026-06-01'),
      });

      const batch = getBatch();
      const update = batch.update.mock.calls[0][1];
      expect(update.status).toBe('sold');
      expect(update.currentCount).toBe(0);
      expect(update.salePrice).toBe(8000);
      expect(update.profit).toBe(3000);
      expect(update.profitMargin).toBe(60);
    });

    it('should keep active for partial batch sale', async () => {
      queueGetDoc({
        currentCount: 10, totalInvested: 50000, status: 'active',
      });

      await service.recordSale('a1', {
        salePrice: 4000, date: new Date('2026-06-01'), countSold: 2,
      });

      const batch = getBatch();
      const update = batch.update.mock.calls[0][1];
      expect(update.currentCount).toBe(8);
      expect(update.status).toBeUndefined();
    });

    it('should handle zero investment', async () => {
      queueGetDoc({
        currentCount: 1, totalInvested: 0, status: 'active',
      });

      await service.recordSale('a1', {
        salePrice: 5000, date: new Date('2026-06-01'),
      });

      const batch = getBatch();
      const update = batch.update.mock.calls[0][1];
      expect(update.profit).toBe(5000);
      expect(update.profitMargin).toBe(0);
    });
  });

  // ──────────── recordDeath ────────────

  describe('recordDeath', () => {
    it('should mark as dead when all die', async () => {
      queueGetDoc({ currentCount: 1, status: 'active' });

      await service.recordDeath('a1', new Date('2026-06-01'));

      const batch = getBatch();
      const update = batch.update.mock.calls[0][1];
      expect(update.status).toBe('dead');
      expect(update.currentCount).toBe(0);
    });

    it('should keep active for partial batch death', async () => {
      queueGetDoc({ currentCount: 10, status: 'active' });

      await service.recordDeath('a1', new Date('2026-06-01'), undefined, 3);

      const batch = getBatch();
      const update = batch.update.mock.calls[0][1];
      expect(update.currentCount).toBe(7);
      expect(update.status).toBeUndefined();
    });
  });

  // ──────────── getDisplayName ────────────

  describe('getDisplayName', () => {
    it('should return name for individual with name', () => {
      expect(service.getDisplayName({
        trackingMode: 'individual', name: 'Raju', tag: 'G-001',
        segmentName: 'Goats', batchSize: 1, id: 'abc123def',
      } as any)).toBe('Raju');
    });

    it('should return tag if no name', () => {
      expect(service.getDisplayName({
        trackingMode: 'individual', tag: 'G-001',
        segmentName: 'Goats', batchSize: 1, id: 'abc123def',
      } as any)).toBe('G-001');
    });

    it('should return segment + truncated ID if no name or tag', () => {
      expect(service.getDisplayName({
        trackingMode: 'individual',
        segmentName: 'Goats', batchSize: 1, id: 'abc123def',
      } as any)).toBe('Goats #abc123');
    });

    it('should return batchLabel for batch', () => {
      expect(service.getDisplayName({
        trackingMode: 'batch', batchLabel: 'Batch A',
        segmentName: 'Goats', batchSize: 10, id: 'abc123def',
      } as any)).toBe('Batch A');
    });

    it('should return fallback for batch without label', () => {
      expect(service.getDisplayName({
        trackingMode: 'batch',
        segmentName: 'Goats', batchSize: 10, id: 'abc123def',
      } as any)).toBe('Batch of 10 Goats');
    });
  });
});
