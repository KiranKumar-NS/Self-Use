/**
 * Reusable Firebase / Firestore mock helpers for Vitest.
 *
 * Usage:
 *   import { mockFirestore, mockWriteBatch, mockRunTransaction } from '../../testing/firebase-mocks';
 *   vi.mock('@angular/fire/firestore', () => mockFirestore());
 */

export function createMockBatch() {
  return {
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  };
}

export function createMockTransaction() {
  return {
    get: vi.fn(),
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

export function createMockTimestamp(date: Date = new Date()) {
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: 0,
  };
}

export function mockFirestore() {
  const batch = createMockBatch();
  const transaction = createMockTransaction();

  return {
    Firestore: vi.fn(),
    collection: vi.fn((_fs: any, path: string) => ({ path })),
    doc: vi.fn((...args: any[]) => ({
      id: args.length > 2 ? args[2] : `mock-id-${Math.random().toString(36).slice(2, 8)}`,
      path: args.length > 2 ? `${args[1]}/${args[2]}` : `collection/mock-id`,
    })),
    getDocs: vi.fn().mockResolvedValue({ docs: [], empty: true, size: 0 }),
    getDoc: vi.fn().mockResolvedValue({
      exists: () => false,
      data: () => undefined,
      id: 'mock-id',
    }),
    query: vi.fn((...args: any[]) => args[0]),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    startAfter: vi.fn(),
    writeBatch: vi.fn(() => batch),
    runTransaction: vi.fn(async (_fs: any, fn: (t: any) => Promise<any>) => fn(transaction)),
    serverTimestamp: vi.fn(() => ({ _serverTimestamp: true })),
    increment: vi.fn((n: number) => ({ _increment: n })),
    arrayUnion: vi.fn((...args: any[]) => ({ _arrayUnion: args })),
    Timestamp: {
      fromDate: (d: Date) => createMockTimestamp(d),
      now: () => createMockTimestamp(new Date()),
    },
    DocumentSnapshot: vi.fn(),
  };
}
