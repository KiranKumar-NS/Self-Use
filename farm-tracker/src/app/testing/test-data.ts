/**
 * Factory functions for creating test data.
 */
import { createMockTimestamp } from './firebase-mocks';

// Legacy individual-mode shape — existing docs only; new records are always batch (see createTestBatchAnimal)
export function createTestAnimal(overrides: Record<string, any> = {}) {
  return {
    id: 'animal-1',
    segment: 'seg1',
    segmentName: 'Goats',
    trackingMode: 'individual' as const,
    tag: 'G-001',
    name: 'Raju',
    breed: 'Jamunapari',
    gender: 'male' as const,
    batchSize: 1,
    currentCount: 1,
    origin: 'purchase' as const,
    originDate: createMockTimestamp(new Date('2026-01-15')),
    purchasePrice: 5000,
    purchasePricePerHead: 5000,
    status: 'active' as const,
    totalCosts: 0,
    costEntries: [],
    totalInvested: 5000,
    createdBy: 'test-uid',
    createdByName: 'Test User',
    createdAt: createMockTimestamp(),
    isDeleted: false,
    month: '2026-01',
    year: 2026,
    ...overrides,
  };
}

export function createTestBatchAnimal(overrides: Record<string, any> = {}) {
  return createTestAnimal({
    id: 'animal-batch-1',
    trackingMode: 'batch',
    tag: undefined,
    name: undefined,
    batchLabel: 'Batch A',
    batchSize: 10,
    currentCount: 10,
    purchasePrice: 50000,
    purchasePricePerHead: 5000,
    totalInvested: 50000,
    ...overrides,
  });
}

export function createTestTransaction(overrides: Record<string, any> = {}) {
  return {
    id: 'txn-1',
    type: 'expense' as const,
    date: createMockTimestamp(new Date('2026-03-15')),
    amount: 1000,
    category: 'cat-feed',
    categoryName: 'Feed',
    segment: 'seg1',
    segmentName: 'Goats',
    description: 'Monthly feed',
    paymentMethod: 'cash' as const,
    paidBy: 'self',
    paidByName: 'Test User',
    createdBy: 'test-uid',
    createdByName: 'Test User',
    createdAt: createMockTimestamp(),
    isDeleted: false,
    timeline: [],
    month: '2026-03',
    year: 2026,
    ...overrides,
  };
}

export function createTestLoan(overrides: Record<string, any> = {}) {
  return {
    id: 'loan-1',
    date: createMockTimestamp(new Date('2026-01-01')),
    amount: 10000,
    type: 'given' as const,
    personName: 'Raju',
    purpose: 'Farm work advance',
    segment: 'seg1',
    segmentName: 'Goats',
    repaymentStatus: 'pending' as const,
    totalRepaid: 0,
    balanceRemaining: 10000,
    recordedBy: 'test-uid',
    recordedByName: 'Test User',
    createdAt: createMockTimestamp(),
    isDeleted: false,
    timeline: [],
    month: '2026-01',
    year: 2026,
    loanCategory: 'simple' as const,
    ...overrides,
  };
}

export function createTestRepayment(overrides: Record<string, any> = {}) {
  return {
    id: 'rep-1',
    date: createMockTimestamp(new Date('2026-02-01')),
    amount: 5000,
    note: 'Partial repayment',
    paidBy: 'test-uid',
    paidByName: 'Raju',
    recordedBy: 'test-uid',
    recordedByName: 'Test User',
    createdAt: createMockTimestamp(),
    ...overrides,
  };
}
