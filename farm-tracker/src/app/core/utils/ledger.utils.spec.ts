import { computeLedgerTotals, ledgerPersonName, ledgerPeople, buildMonthOptions } from './ledger.utils';
import { createTestTransaction } from '../../testing/test-data';
import { Transaction } from '../models/transaction.model';

const txn = (overrides: Record<string, any> = {}) => createTestTransaction(overrides) as unknown as Transaction;

describe('ledger.utils', () => {
  describe('computeLedgerTotals', () => {
    it('returns zeros for an empty list', () => {
      expect(computeLedgerTotals([])).toEqual({ count: 0, total: 0, settled: 0, pending: 0 });
    });

    it('counts settled expenses in full', () => {
      const rows = [txn({ amount: 1000 }), txn({ id: 'b', amount: 250, expensePaymentStatus: 'paid' })];
      expect(computeLedgerTotals(rows)).toEqual({ count: 2, total: 1250, settled: 1250, pending: 0 });
    });

    it('splits pending credit expenses into paid and outstanding', () => {
      const rows = [
        txn({ amount: 1000, expensePaymentStatus: 'pending' }),                 // nothing paid yet
        txn({ id: 'b', amount: 600, expensePaymentStatus: 'pending', amountPaid: 200 }), // partial
      ];
      expect(computeLedgerTotals(rows)).toEqual({ count: 2, total: 1600, settled: 200, pending: 1400 });
    });

    it('splits pending income into received and outstanding', () => {
      const rows = [
        txn({ type: 'income', amount: 5000 }),                                            // received (default)
        txn({ id: 'b', type: 'income', amount: 4000, paymentStatus: 'pending' }),
        txn({ id: 'c', type: 'income', amount: 3000, paymentStatus: 'pending', amountReceived: 1000 }),
      ];
      expect(computeLedgerTotals(rows)).toEqual({ count: 3, total: 12000, settled: 6000, pending: 6000 });
    });

    it('always satisfies settled + pending = total', () => {
      const rows = [
        txn({ amount: 1000, expensePaymentStatus: 'pending', amountPaid: 999 }),
        txn({ id: 'b', type: 'income', amount: 700, paymentStatus: 'pending', amountReceived: 700 }),
        txn({ id: 'c', type: 'income', amount: 300 }),
      ];
      const t = computeLedgerTotals(rows);
      expect(t.settled + t.pending).toBe(t.total);
    });
  });

  describe('ledgerPersonName / ledgerPeople', () => {
    it('prefers paidByName, normalised', () => {
      expect(ledgerPersonName({ paidByName: '  raju   sharma ', createdByName: 'Admin' })).toBe('Raju Sharma');
    });

    it('falls back to createdByName, then Unknown', () => {
      expect(ledgerPersonName({ paidByName: null, createdByName: 'admin user' })).toBe('Admin User');
      expect(ledgerPersonName({ paidByName: null, createdByName: '' })).toBe('Unknown');
    });

    it('lists distinct people sorted A→Z', () => {
      const rows = [
        txn({ paidByName: 'Zara' }),
        txn({ id: 'b', paidByName: 'amit' }),
        txn({ id: 'c', paidByName: 'Amit' }),
        txn({ id: 'd', paidByName: null, createdByName: 'Meena' }),
      ];
      expect(ledgerPeople(rows)).toEqual(['Amit', 'Meena', 'Zara']);
    });
  });

  describe('buildMonthOptions', () => {
    it('lists months from the start month to now, newest first, with labels', () => {
      const opts = buildMonthOptions('2026-07', new Date(2026, 8, 23)); // Sep 2026
      expect(opts.map(o => o.value)).toEqual(['2026-09', '2026-08', '2026-07']);
      expect(opts[0].label).toMatch(/September 2026/);
    });

    it('still returns the current month when the start is in the future', () => {
      const opts = buildMonthOptions('2027-01', new Date(2026, 8, 23));
      expect(opts.map(o => o.value)).toEqual(['2026-09']);
    });
  });
});
