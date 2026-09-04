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
    updateDoc: vi.fn().mockResolvedValue(undefined),
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
import { writeBatch, updateDoc } from '@angular/fire/firestore';

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
    it('should set purchasePricePerHead equal to purchasePrice for a 1-head batch', async () => {
      await service.create({
        segment: 'seg1', segmentName: 'Goats', trackingMode: 'batch',
        batchSize: 1, batchLabel: 'Lakshmi', origin: 'purchase', originDate: new Date('2026-01-15'),
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

    it('should handle zero purchase price (birth)', async () => {
      await service.create({
        segment: 'seg1', segmentName: 'Goats', trackingMode: 'batch',
        batchSize: 1, batchLabel: 'Goats Jan-2026', origin: 'birth', originDate: new Date('2026-01-15'),
      });

      const batch = getBatch();
      const setCall = batch.set.mock.calls[0][1];
      expect(setCall.purchasePrice).toBe(0);
      expect(setCall.totalInvested).toBe(0);
    });

    it('should set optional fields only when provided (legacy individual mode still accepted)', async () => {
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

    it('should persist originInventoryEventId when provided', async () => {
      await service.create({
        segment: 'seg1', segmentName: 'Goats', trackingMode: 'batch',
        batchSize: 3, batchLabel: 'Goats Jan-2026', origin: 'purchase', originDate: new Date('2026-01-15'),
        originInventoryEventId: 'ev-123',
      });

      const batch = getBatch();
      const setCall = batch.set.mock.calls[0][1];
      expect(setCall.originInventoryEventId).toBe('ev-123');
    });
  });

  // Cost attribution moved to TransactionService.setAnimalAttribution (atomic with the
  // txn's link fields) — covered in transaction.service.spec.ts and animal-cost.utils.spec.ts.

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

    it('should stamp deathCause and deathInventoryEventId when provided', async () => {
      queueGetDoc({ currentCount: 1, status: 'active' });

      await service.recordDeath('a1', new Date('2026-06-01'), 'sick', 1, 'disease', 'ev-9');

      const batch = getBatch();
      const update = batch.update.mock.calls[0][1];
      expect(update.deathCause).toBe('disease');
      expect(update.deathNote).toBe('sick');
      expect(update.deathInventoryEventId).toBe('ev-9');
    });

    it('should omit deathInventoryEventId when absent', async () => {
      queueGetDoc({ currentCount: 1, status: 'active' });

      await service.recordDeath('a1', new Date('2026-06-01'));

      const batch = getBatch();
      const update = batch.update.mock.calls[0][1];
      expect(update.deathInventoryEventId).toBeUndefined();
    });
  });

  // ──────────── softDelete / hardDelete (origin event reversal) ────────────

  describe('delete with stock reversal', () => {
    function mockInventory(event: any) {
      const inventory = {
        getEventById: vi.fn().mockResolvedValue(event),
        reverseEventInBatch: vi.fn(),
      };
      const segments = { clearCache: vi.fn() };
      (service as any).inventoryService = inventory;
      (service as any).segmentService = segments;
      return { inventory, segments };
    }

    it('soft delete reverses the origin event for an active untouched animal', async () => {
      queueGetDoc({ originInventoryEventId: 'ev1', status: 'active', currentCount: 5, batchSize: 5 });
      const { inventory, segments } = mockInventory({ id: 'ev1', segment: 'goats', count: 5 });

      const result = await service.softDelete('a1');

      expect(result).toEqual({ stockReversed: true });
      expect(inventory.getEventById).toHaveBeenCalledWith('ev1');
      expect(inventory.reverseEventInBatch).toHaveBeenCalledWith(
        expect.anything(), { id: 'ev1', segment: 'goats', count: 5 }, false,
      );
      const batch = getBatch();
      expect(batch.update).toHaveBeenCalledWith(expect.anything(), { isDeleted: true });
      expect(segments.clearCache).toHaveBeenCalled();
    });

    it('hard delete maps to hard event reversal and deletes the doc', async () => {
      queueGetDoc({ originInventoryEventId: 'ev1', status: 'active', currentCount: 1, batchSize: 1 });
      const { inventory } = mockInventory({ id: 'ev1', segment: 'goats', count: 1 });

      const result = await service.hardDelete('a1');

      expect(result.stockReversed).toBe(true);
      expect(inventory.reverseEventInBatch).toHaveBeenCalledWith(expect.anything(), expect.anything(), true);
      const batch = getBatch();
      expect(batch.delete).toHaveBeenCalled();
    });

    it('skips reversal for legacy animals without an origin event id', async () => {
      queueGetDoc({ status: 'active', currentCount: 1, batchSize: 1 });
      const { inventory, segments } = mockInventory(null);

      const result = await service.softDelete('a1');

      expect(result).toEqual({ stockReversed: false, skippedReason: 'legacy' });
      expect(inventory.getEventById).not.toHaveBeenCalled();
      expect(inventory.reverseEventInBatch).not.toHaveBeenCalled();
      expect(segments.clearCache).not.toHaveBeenCalled();
      const batch = getBatch();
      expect(batch.update).toHaveBeenCalledWith(expect.anything(), { isDeleted: true });
    });

    it('skips reversal for animals with recorded exits (partial batch)', async () => {
      queueGetDoc({ originInventoryEventId: 'ev1', status: 'active', currentCount: 6, batchSize: 10 });
      const { inventory } = mockInventory({ id: 'ev1', segment: 'goats', count: 10 });

      const result = await service.softDelete('a1');

      expect(result).toEqual({ stockReversed: false, skippedReason: 'has-exits' });
      expect(inventory.getEventById).not.toHaveBeenCalled();
    });

    it('skips reversal for sold animals', async () => {
      queueGetDoc({ originInventoryEventId: 'ev1', status: 'sold', currentCount: 0, batchSize: 1 });
      const { inventory } = mockInventory({ id: 'ev1', segment: 'goats', count: 1 });

      const result = await service.hardDelete('a1');

      expect(result.skippedReason).toBe('has-exits');
      expect(inventory.reverseEventInBatch).not.toHaveBeenCalled();
    });

    it('skips reversal when the origin event is missing or already deleted', async () => {
      queueGetDoc({ originInventoryEventId: 'ev1', status: 'active', currentCount: 1, batchSize: 1 });
      const { inventory } = mockInventory(null);

      const result = await service.softDelete('a1');

      expect(result).toEqual({ stockReversed: false, skippedReason: 'event-missing' });
      expect(inventory.getEventById).toHaveBeenCalledWith('ev1');
      expect(inventory.reverseEventInBatch).not.toHaveBeenCalled();
    });

    it('still deletes when the animal doc does not exist', async () => {
      // no queued getDoc → exists() is false
      const { inventory } = mockInventory(null);

      const result = await service.softDelete('a1');

      expect(result).toEqual({ stockReversed: false });
      expect(inventory.getEventById).not.toHaveBeenCalled();
      const batch = getBatch();
      expect(batch.update).toHaveBeenCalledWith(expect.anything(), { isDeleted: true });
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

  // ──────────── editing an event's Count propagates to the batch ────────────

  describe('setOriginCount', () => {
    function lastUpdate() {
      return (updateDoc as any).mock.calls.slice(-1)[0][1];
    }

    it('should resize an untouched batch', async () => {
      queueGetDoc({ batchSize: 10, currentCount: 10, status: 'active' });
      await service.setOriginCount('a1', 12);
      expect(lastUpdate()).toMatchObject({ batchSize: 12, currentCount: 12 });
    });

    it('should keep already-exited heads when resizing', async () => {
      // 10 bought, 3 sold → 7 left. Correcting the purchase to 12 leaves 9 in hand.
      queueGetDoc({ batchSize: 10, currentCount: 7, status: 'active' });
      await service.setOriginCount('a1', 12);
      expect(lastUpdate()).toMatchObject({ batchSize: 12, currentCount: 9 });
    });

    it('should refuse to shrink below the heads that already left', async () => {
      queueGetDoc({ batchSize: 10, currentCount: 4, status: 'active' });
      await expect(service.setOriginCount('a1', 5)).rejects.toThrow(/already been sold or died/);
    });

    it('should reactivate a fully-exited batch that regains heads', async () => {
      queueGetDoc({ batchSize: 5, currentCount: 0, status: 'sold' });
      await service.setOriginCount('a1', 8);
      expect(lastUpdate()).toMatchObject({ batchSize: 8, currentCount: 3, status: 'active' });
    });
  });

  describe('adjustExitCount', () => {
    function lastUpdate() {
      return (updateDoc as any).mock.calls.slice(-1)[0][1];
    }

    it('should draw the batch down when more heads are sold', async () => {
      queueGetDoc({ batchSize: 10, currentCount: 8, status: 'active' });
      await service.adjustExitCount('a1', 3, 'sale', new Date('2026-05-15'));
      expect(lastUpdate()).toMatchObject({ currentCount: 5 });
    });

    it('should mark the batch sold when the last head leaves', async () => {
      queueGetDoc({ batchSize: 10, currentCount: 2, status: 'active' });
      await service.adjustExitCount('a1', 2, 'sale', new Date('2026-05-15'));
      expect(lastUpdate()).toMatchObject({ currentCount: 0, status: 'sold', exitType: 'sale' });
    });

    it('should reactivate a sold batch when the count is corrected downwards', async () => {
      queueGetDoc({ batchSize: 10, currentCount: 0, status: 'sold' });
      await service.adjustExitCount('a1', -4, 'sale', new Date('2026-05-15'));
      expect(lastUpdate()).toMatchObject({ currentCount: 4, status: 'active', exitType: null });
    });

    it('should refuse to exit more heads than remain', async () => {
      queueGetDoc({ batchSize: 10, currentCount: 2, status: 'active' });
      await expect(service.adjustExitCount('a1', 5, 'death', new Date())).rejects.toThrow(/Only 2 head remain/);
    });

    it('should refuse to push the batch above its original size', async () => {
      queueGetDoc({ batchSize: 10, currentCount: 10, status: 'active' });
      await expect(service.adjustExitCount('a1', -2, 'sale', new Date())).rejects.toThrow(/only ever held 10/);
    });

    it('should do nothing when the count is unchanged', async () => {
      await service.adjustExitCount('a1', 0, 'sale', new Date());
      expect((updateDoc as any)).not.toHaveBeenCalled();
    });
  });

  describe('setSaleAmount', () => {
    it('should recompute profit from the new sale price', async () => {
      queueGetDoc({ status: 'sold', totalInvested: 50000 });
      await service.setSaleAmount('a1', 78000, 6);
      expect((updateDoc as any).mock.calls.slice(-1)[0][1]).toMatchObject({
        salePrice: 78000, salePricePerHead: 13000, profit: 28000, profitMargin: 56,
      });
    });

    it('should leave a partially-sold batch alone (it has no single sale price)', async () => {
      queueGetDoc({ status: 'active', totalInvested: 50000 });
      await service.setSaleAmount('a1', 78000, 6);
      expect((updateDoc as any)).not.toHaveBeenCalled();
    });
  });
});
