/**
 * Tests for InventoryService.
 * Tests count delta logic and stock update behavior.
 */

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
      id: args.length > 2 ? args[2] : 'new-event-id',
      path: args.length > 2 ? `${args[1]}/${args[2]}` : 'inventoryEvents/new-event-id',
    })),
    getDocs: vi.fn().mockResolvedValue({ docs: [], empty: true }),
    getDoc: vi.fn(async () => ({ exists: () => false, data: () => undefined })),
    query: vi.fn(),
    orderBy: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    writeBatch: vi.fn(() => batchMethods),
    serverTimestamp: vi.fn(() => 'SERVER_TS'),
    increment: vi.fn((n: number) => ({ _increment: n })),
    arrayUnion: vi.fn((...args: any[]) => ({ _arrayUnion: args })),
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
      clearCache: vi.fn(),
    })),
  };
});

import { InventoryService } from './inventory.service';
import { writeBatch, increment, getDoc } from '@angular/fire/firestore';

describe('InventoryService', () => {
  let service: InventoryService;

  function getBatch() {
    return (writeBatch as any).mock.results.slice(-1)[0]?.value;
  }

  beforeEach(() => {
    service = new InventoryService();
    vi.clearAllMocks();
  });

  describe('recordEvent - count delta logic', () => {
    const baseData = {
      segment: 'seg1', segmentName: 'Goats',
      note: 'test', date: new Date('2026-06-01'),
      month: '2026-06', year: 2026,
    };

    it('should make birth count positive', async () => {
      await service.recordEvent({ ...baseData, eventType: 'birth', count: 5 } as any);

      const batch = getBatch();
      const setCall = batch.set.mock.calls[0][1];
      expect(setCall.count).toBe(5);
      expect(increment).toHaveBeenCalledWith(5);
    });

    it('should make purchase count positive (absolute value)', async () => {
      await service.recordEvent({ ...baseData, eventType: 'purchase', count: -10 } as any);

      const batch = getBatch();
      const setCall = batch.set.mock.calls[0][1];
      expect(setCall.count).toBe(10);
    });

    it('should make sale count negative', async () => {
      await service.recordEvent({ ...baseData, eventType: 'sale', count: 3 } as any);

      const batch = getBatch();
      const setCall = batch.set.mock.calls[0][1];
      expect(setCall.count).toBe(-3);
    });

    it('should make death count negative', async () => {
      await service.recordEvent({ ...baseData, eventType: 'death', count: 2 } as any);

      const batch = getBatch();
      const setCall = batch.set.mock.calls[0][1];
      expect(setCall.count).toBe(-2);
    });

    it('should keep adjustment count as-is (positive)', async () => {
      await service.recordEvent({ ...baseData, eventType: 'adjustment', count: 5 } as any);

      const batch = getBatch();
      const setCall = batch.set.mock.calls[0][1];
      expect(setCall.count).toBe(5);
    });

    it('should keep adjustment count as-is (negative)', async () => {
      await service.recordEvent({ ...baseData, eventType: 'adjustment', count: -3 } as any);

      const batch = getBatch();
      const setCall = batch.set.mock.calls[0][1];
      expect(setCall.count).toBe(-3);
    });
  });

  describe('getEventById', () => {
    it('should return null when the event does not exist', async () => {
      expect(await service.getEventById('missing')).toBeNull();
    });

    it('should return null when the event is soft-deleted', async () => {
      (getDoc as any).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ id: 'e1', segment: 'seg1', count: 5, isDeleted: true }),
      });
      expect(await service.getEventById('e1')).toBeNull();
    });

    it('should return the event otherwise', async () => {
      (getDoc as any).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ id: 'e1', segment: 'seg1', count: 5 }),
      });
      expect(await service.getEventById('e1')).toEqual({ id: 'e1', segment: 'seg1', count: 5 });
    });
  });

  describe('reverseEventInBatch', () => {
    it('soft: marks the event deleted and reverses the stock delta', () => {
      const batch = { update: vi.fn(), delete: vi.fn() };
      service.reverseEventInBatch(batch as any, { id: 'e1', segment: 'seg1', count: 4 }, false);

      expect(batch.delete).not.toHaveBeenCalled();
      expect(batch.update).toHaveBeenCalledTimes(2);
      expect(batch.update.mock.calls[0][1]).toEqual({ isDeleted: true });
      expect(increment).toHaveBeenCalledWith(-4);
    });

    it('hard: deletes the event doc and reverses a negative delta', () => {
      const batch = { update: vi.fn(), delete: vi.fn() };
      service.reverseEventInBatch(batch as any, { id: 'e1', segment: 'seg1', count: -3 }, true);

      expect(batch.delete).toHaveBeenCalledTimes(1);
      expect(batch.update).toHaveBeenCalledTimes(1); // segment stock only
      expect(increment).toHaveBeenCalledWith(3);
    });
  });

  describe('deleteEvent', () => {
    it('should reverse stock change', async () => {
      await service.deleteEvent('event-1', 'seg1', 5);

      const batch = getBatch();
      expect(batch.delete).toHaveBeenCalledTimes(1);
      expect(increment).toHaveBeenCalledWith(-5);
    });

    it('should reverse negative stock change (death/sale)', async () => {
      await service.deleteEvent('event-1', 'seg1', -3);

      expect(increment).toHaveBeenCalledWith(3);
    });
  });

  describe('softDeleteEvent', () => {
    it('should set isDeleted and reverse stock', async () => {
      await service.softDeleteEvent('event-1', 'seg1', 5);

      const batch = getBatch();
      expect(batch.update).toHaveBeenCalledTimes(2);
      expect(batch.update.mock.calls[0][1]).toEqual({ isDeleted: true });
      expect(increment).toHaveBeenCalledWith(-5);
    });
  });

  describe('updateEvent', () => {
    const baseData = {
      segment: 'seg1', segmentName: 'Goats', eventType: 'birth',
      count: 8, note: 'updated', date: new Date('2026-06-01'),
      month: '2026-06', year: 2026,
    };

    it('should apply net difference for same segment', async () => {
      const oldEvent = { segment: 'seg1', count: 5 } as any;
      await service.updateEvent('event-1', oldEvent, baseData as any);

      const batch = getBatch();
      // event update + segment stock update
      expect(batch.update).toHaveBeenCalledTimes(2);
      expect(increment).toHaveBeenCalledWith(3); // 8 - 5
    });

    it('should reverse old and apply new for different segments', async () => {
      const oldEvent = { segment: 'seg-old', count: 5 } as any;
      await service.updateEvent('event-1', oldEvent, {
        ...baseData, segment: 'seg-new', segmentName: 'Chickens',
      } as any);

      const batch = getBatch();
      expect(batch.update).toHaveBeenCalledTimes(3);
      expect(increment).toHaveBeenCalledWith(-5);
      expect(increment).toHaveBeenCalledWith(8);
    });

    it('should not update stock if count unchanged in same segment', async () => {
      const oldEvent = { segment: 'seg1', count: 5 } as any;
      await service.updateEvent('event-1', oldEvent, {
        ...baseData, count: 5,
      } as any);

      const batch = getBatch();
      expect(batch.update).toHaveBeenCalledTimes(1); // only event doc
    });
  });
});
