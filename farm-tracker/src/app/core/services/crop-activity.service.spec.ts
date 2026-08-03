/**
 * Tests for CropActivityService — auto-created linked expense behavior.
 * Verifies create/update/softDelete keep a crop activity's cost in sync with a
 * linked expense transaction (via a mocked TransactionService).
 */

let getDocResult: any = { exists: () => false, data: () => null };

vi.mock('@angular/fire/firestore', () => ({
  Firestore: class {},
  collection: vi.fn((_fs: any, path: string) => ({ path })),
  doc: vi.fn((...args: any[]) => ({
    id: args.length > 2 ? args[2] : 'new-activity-id',
    path: args.length > 2 ? `${args[1]}/${args[2]}` : 'cropActivities/new-activity-id',
  })),
  getDoc: vi.fn(() => Promise.resolve(getDocResult)),
  getDocs: vi.fn().mockResolvedValue({ docs: [], empty: true }),
  setDoc: vi.fn().mockResolvedValue(undefined),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  query: vi.fn(),
  orderBy: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
  Timestamp: {
    fromDate: (d: Date) => ({ toDate: () => d }),
    now: () => ({ toDate: () => new Date('2026-06-01') }),
  },
}));

vi.mock('@angular/fire/auth', () => ({ Auth: class {}, onAuthStateChanged: vi.fn() }));

const txnService = {
  create: vi.fn().mockResolvedValue('txn-new'),
  update: vi.fn().mockResolvedValue(undefined),
  softDelete: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@angular/core', async () => {
  const actual = await vi.importActual('@angular/core');
  return {
    ...(actual as any),
    inject: vi.fn(() => ({
      requireUser: () => ({ uid: 'test-uid', displayName: 'Test User' }),
      ...txnService,
    })),
  };
});

import { CropActivityService, CropExpenseMeta } from './crop-activity.service';
import { setDoc, updateDoc, Timestamp } from '@angular/fire/firestore';

const META: CropExpenseMeta = {
  paidBy: 'uid-raju',
  paidByName: 'Raju',
  paymentMethod: 'cash',
  expensePaymentStatus: 'paid',
};

function activityData(overrides: any = {}) {
  return {
    segment: 'dragon',
    segmentName: 'Dragon Fruit',
    activityType: 'fertilizer',
    date: Timestamp.fromDate(new Date('2026-06-01')),
    description: 'Fertilizing',
    ...overrides,
  };
}

describe('CropActivityService — linked expense', () => {
  let service: CropActivityService;

  beforeEach(() => {
    service = new CropActivityService();
    vi.clearAllMocks();
    getDocResult = { exists: () => false, data: () => null };
  });

  describe('create', () => {
    it('creates a linked expense when cost > 0 and stores its id', async () => {
      await service.create(activityData({ cost: 500 }), META);

      expect(txnService.create).toHaveBeenCalledTimes(1);
      const payload = txnService.create.mock.calls[0][0];
      expect(payload).toMatchObject({
        type: 'expense',
        amount: 500,
        segment: 'dragon',
        paidBy: 'uid-raju',
        paidByName: 'Raju',
        paymentMethod: 'cash',
        expensePaymentStatus: 'paid',
        category: 'other-expense',
        tags: ['crop-activity'],
      });

      const written = (setDoc as any).mock.calls[0][1];
      expect(written.linkedTransactionId).toBe('txn-new');
      expect(written.cost).toBe(500);
    });

    it('uses the labor category when laborCount is set', async () => {
      await service.create(activityData({ cost: 300, laborCount: 2, activityType: 'weeding' }), META);
      expect(txnService.create.mock.calls[0][0].category).toBe('labor');
    });

    it('does NOT create an expense when cost is missing/zero', async () => {
      await service.create(activityData({ cost: 0 }));
      expect(txnService.create).not.toHaveBeenCalled();
      expect((setDoc as any).mock.calls[0][1].linkedTransactionId).toBeNull();
    });
  });

  describe('update', () => {
    it('updates the linked expense when cost stays > 0', async () => {
      getDocResult = { exists: () => true, data: () => ({ linkedTransactionId: 'txn-1', cost: 500 }) };

      await service.update('act-1', activityData({ cost: 800 }), META);

      expect(txnService.update).toHaveBeenCalledTimes(1);
      expect(txnService.update.mock.calls[0][0]).toBe('txn-1');
      expect(txnService.update.mock.calls[0][1].amount).toBe(800);
      expect(txnService.create).not.toHaveBeenCalled();
      expect((updateDoc as any).mock.calls[0][1].linkedTransactionId).toBe('txn-1');
    });

    it('reverses the linked expense when cost is cleared', async () => {
      getDocResult = { exists: () => true, data: () => ({ linkedTransactionId: 'txn-1', cost: 500 }) };

      await service.update('act-1', activityData({ cost: undefined }));

      expect(txnService.softDelete).toHaveBeenCalledWith('txn-1');
      expect((updateDoc as any).mock.calls[0][1].linkedTransactionId).toBeNull();
    });

    it('creates an expense when cost is newly added to a pre-feature activity', async () => {
      getDocResult = { exists: () => true, data: () => ({ linkedTransactionId: null, cost: null }) };

      await service.update('act-1', activityData({ cost: 250 }), META);

      expect(txnService.create).toHaveBeenCalledTimes(1);
      expect(txnService.update).not.toHaveBeenCalled();
      expect((updateDoc as any).mock.calls[0][1].linkedTransactionId).toBe('txn-new');
    });
  });

  describe('softDelete', () => {
    it('reverses the linked expense then flags the activity deleted', async () => {
      getDocResult = { exists: () => true, data: () => ({ linkedTransactionId: 'txn-1' }) };

      await service.softDelete('act-1');

      expect(txnService.softDelete).toHaveBeenCalledWith('txn-1');
      expect((updateDoc as any).mock.calls.slice(-1)[0][1]).toEqual({ isDeleted: true });
    });

    it('still deletes the activity when there is no linked expense', async () => {
      getDocResult = { exists: () => true, data: () => ({ linkedTransactionId: null }) };

      await service.softDelete('act-1');

      expect(txnService.softDelete).not.toHaveBeenCalled();
      expect((updateDoc as any).mock.calls.slice(-1)[0][1]).toEqual({ isDeleted: true });
    });
  });
});
