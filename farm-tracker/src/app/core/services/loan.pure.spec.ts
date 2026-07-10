/**
 * Tests for the pure loan math functions in loan-math.ts.
 * No Angular or Firestore mocking needed — the functions are plain modules.
 */

import {
  purityFactor,
  computeGoldValue,
  rbiLtvRatio,
  computeGoldAggregates,
  toAnnualRate,
  generateEMISchedule,
  buildLiveEMISchedule,
} from './loan-math';

describe('Loan Pure Functions', () => {

  // ──────────── Gold loan helpers ────────────

  describe('purityFactor', () => {
    it('should return 1.0 for 24K', () => {
      expect(purityFactor('24K')).toBe(1.0);
    });

    it('should return 0.916 for 22K', () => {
      expect(purityFactor('22K')).toBe(0.916);
    });

    it('should return 0.75 for 18K', () => {
      expect(purityFactor('18K')).toBe(0.75);
    });

    it('should default to 0.916 for unknown purity', () => {
      expect(purityFactor('unknown')).toBe(0.916);
    });
  });

  describe('computeGoldValue', () => {
    it('should calculate gold value correctly for 22K', () => {
      const result = computeGoldValue(10, '22K', 6000);
      expect(result).toBe(54960);
    });

    it('should calculate gold value for 24K', () => {
      expect(computeGoldValue(10, '24K', 6000)).toBe(60000);
    });

    it('should handle zero weight', () => {
      expect(computeGoldValue(0, '22K', 6000)).toBe(0);
    });

    it('should round to 2 decimal places', () => {
      const result = computeGoldValue(3, '22K', 5555);
      expect(result).toBe(Math.round(3 * 0.916 * 5555 * 100) / 100);
    });
  });

  describe('rbiLtvRatio', () => {
    it('should return 0.85 for gold value <= 2.5L', () => {
      expect(rbiLtvRatio(100000)).toBe(0.85);
      expect(rbiLtvRatio(250000)).toBe(0.85);
    });

    it('should return 0.80 for gold value 2.5L-5L', () => {
      expect(rbiLtvRatio(250001)).toBe(0.80);
      expect(rbiLtvRatio(500000)).toBe(0.80);
    });

    it('should return 0.75 for gold value > 5L', () => {
      expect(rbiLtvRatio(500001)).toBe(0.75);
      expect(rbiLtvRatio(1000000)).toBe(0.75);
    });
  });

  describe('computeGoldAggregates', () => {
    it('should sum gold items that are not released', () => {
      const collaterals = [
        { type: 'gold', isReleased: false, netWeight: 10, goldValue: 50000 },
        { type: 'gold', isReleased: false, netWeight: 5, goldValue: 25000 },
      ];
      const result = computeGoldAggregates(collaterals);
      expect(result.totalGoldWeight).toBe(15);
      expect(result.totalGoldValue).toBe(75000);
    });

    it('should exclude released items', () => {
      const collaterals = [
        { type: 'gold', isReleased: false, netWeight: 10, goldValue: 50000 },
        { type: 'gold', isReleased: true, netWeight: 5, goldValue: 25000 },
      ];
      const result = computeGoldAggregates(collaterals);
      expect(result.totalGoldWeight).toBe(10);
      expect(result.totalGoldValue).toBe(50000);
    });

    it('should exclude non-gold items', () => {
      const collaterals = [
        { type: 'gold', isReleased: false, netWeight: 10, goldValue: 50000 },
        { type: 'property', isReleased: false, estimatedValue: 100000 },
      ];
      const result = computeGoldAggregates(collaterals);
      expect(result.totalGoldWeight).toBe(10);
      expect(result.totalGoldValue).toBe(50000);
    });

    it('should handle null collaterals', () => {
      const result = computeGoldAggregates(null as any);
      expect(result.totalGoldWeight).toBe(0);
      expect(result.totalGoldValue).toBe(0);
    });

    it('should fallback to grossWeight/weight/estimatedValue', () => {
      const collaterals = [
        { type: 'gold', isReleased: false, grossWeight: 15, goldValue: 50000 },
        { type: 'gold', isReleased: false, weight: 8, estimatedValue: 30000 },
      ];
      const result = computeGoldAggregates(collaterals);
      expect(result.totalGoldWeight).toBe(23);
      expect(result.totalGoldValue).toBe(80000);
    });
  });

  // ──────────── Interest rate helpers ────────────

  describe('toAnnualRate', () => {
    it('should convert monthly rate to annual', () => {
      expect(toAnnualRate(1, 'monthly')).toBe(12);
    });

    it('should convert weekly rate to annual', () => {
      expect(toAnnualRate(0.5, 'weekly')).toBe(26);
    });

    it('should pass annual rate through', () => {
      expect(toAnnualRate(12, 'annual')).toBe(12);
    });
  });

  // ──────────── EMI Schedule Generation ────────────

  describe('generateEMISchedule', () => {
    it('should generate correct number of entries', () => {
      const entries = generateEMISchedule(100000, 12, 12, new Date('2026-01-01'));
      expect(entries).toHaveLength(12);
    });

    it('should have increasing principal and decreasing interest', () => {
      const entries = generateEMISchedule(100000, 12, 12, new Date('2026-01-01'));
      expect(entries[0].principal).toBeLessThan(entries[entries.length - 1].principal);
      expect(entries[0].interest).toBeGreaterThan(entries[entries.length - 1].interest);
    });

    it('should have total principal equal to original amount', () => {
      const entries = generateEMISchedule(100000, 12, 12, new Date('2026-01-01'));
      const totalPrincipal = entries.reduce((sum, e) => sum + e.principal, 0);
      expect(totalPrincipal).toBeCloseTo(100000, 0);
    });

    it('should have consistent EMI amounts except last', () => {
      const entries = generateEMISchedule(100000, 12, 12, new Date('2026-01-01'));
      const emi = entries[0].emiAmount;
      for (let i = 1; i < entries.length - 1; i++) {
        expect(entries[i].emiAmount).toBe(emi);
      }
    });

    it('should handle zero interest rate', () => {
      const entries = generateEMISchedule(60000, 0, 6, new Date('2026-01-01'));
      expect(entries).toHaveLength(6);
      expect(entries[0].emiAmount).toBe(10000);
      expect(entries[0].interest).toBe(0);
      const total = entries.reduce((sum, e) => sum + e.principal, 0);
      expect(total).toBeCloseTo(60000, 0);
    });

    it('should handle moratorium period', () => {
      const entries = generateEMISchedule(100000, 12, 12, new Date('2026-01-01'), 3);
      expect(entries).toHaveLength(15);
      for (let i = 0; i < 3; i++) {
        expect(entries[i].emiAmount).toBe(0);
        expect(entries[i].principal).toBe(0);
        expect(entries[i].interest).toBeGreaterThan(0);
      }
      expect(entries[3].emiAmount).toBeGreaterThan(0);
    });

    it('should use effective rate for subsidized loans', () => {
      const normal = generateEMISchedule(100000, 12, 12, new Date('2026-01-01'));
      const subsidized = generateEMISchedule(100000, 12, 12, new Date('2026-01-01'), 0, 6);
      expect(subsidized[0].emiAmount).toBeLessThan(normal[0].emiAmount);
    });

    it('should handle 1-month tenure', () => {
      const entries = generateEMISchedule(10000, 12, 1, new Date('2026-01-01'));
      expect(entries).toHaveLength(1);
      expect(entries[0].principal).toBeCloseTo(10000, 0);
      expect(entries[0].interest).toBeCloseTo(100, 0);
    });

    it('should set correct due dates', () => {
      const entries = generateEMISchedule(10000, 12, 3, new Date('2026-01-01'));
      expect(entries[0].dueDate.getMonth()).toBe(0);
      expect(entries[1].dueDate.getMonth()).toBe(1);
      expect(entries[2].dueDate.getMonth()).toBe(2);
    });

    it('should set sequential EMI numbers', () => {
      const entries = generateEMISchedule(10000, 12, 5, new Date('2026-01-01'));
      for (let i = 0; i < entries.length; i++) {
        expect(entries[i].emiNumber).toBe(i + 1);
      }
    });

    it('should clear remaining balance exactly on last EMI', () => {
      const entries = generateEMISchedule(100000, 12, 12, new Date('2026-01-01'));
      let remaining = 100000;
      for (const e of entries) {
        remaining -= e.principal;
      }
      expect(remaining).toBeCloseTo(0, 2);
    });
  });

  // ──────────── Build Live EMI Schedule ────────────

  describe('buildLiveEMISchedule', () => {
    const makeLoan = (overrides: any = {}) => ({
      amount: 100000,
      sanctionedAmount: 100000,
      date: { toDate: () => new Date('2026-01-01') },
      emiStartDate: { toDate: () => new Date('2026-01-01') },
      interestRate: 12,
      tenure: 6,
      moratoriumMonths: 0,
      emisPaid: 0,
      totalPartPayments: 0,
      rateChanges: [],
      outstandingBalance: 100000,
      isSubsidized: false,
      ...overrides,
    });

    it('should generate entries for all EMIs', () => {
      const entries = buildLiveEMISchedule(makeLoan() as any, []);
      expect(entries).toHaveLength(6);
    });

    it('should mark moratorium entries', () => {
      const loan = makeLoan({ moratoriumMonths: 2, tenure: 4 });
      const entries = buildLiveEMISchedule(loan as any, []);
      expect(entries[0].status).toBe('moratorium');
      expect(entries[1].status).toBe('moratorium');
    });

    it('should mark paid EMIs', () => {
      const repayments = [{
        id: 'r1', date: { toDate: () => new Date('2026-01-15') },
        amount: 17500, isEMIPayment: true, emiNumber: 1,
      }];
      const entries = buildLiveEMISchedule(makeLoan() as any, repayments as any);
      expect(entries[0].status).toBe('paid');
      expect(entries[0].paidAmount).toBe(17500);
    });

    it('should mark overdue unpaid EMIs', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-12-01'));
      const entries = buildLiveEMISchedule(makeLoan() as any, []);
      expect(entries[0].status).toBe('overdue');
      vi.useRealTimers();
    });

    it('should mark future EMIs as upcoming', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-12-01'));
      const entries = buildLiveEMISchedule(makeLoan() as any, []);
      expect(entries[0].status).toBe('upcoming');
      vi.useRealTimers();
    });

    it('should include part-payment entries', () => {
      const repayments = [{
        id: 'pp-1', date: { toDate: () => new Date('2026-02-15') },
        amount: 5000, isPartPayment: true, principalPortion: 5000,
      }];
      const entries = buildLiveEMISchedule(makeLoan() as any, repayments as any);
      const pp = entries.find(e => e.isPartPayment);
      expect(pp).toBeDefined();
      expect(pp!.emiNumber).toBe(0);
      expect(pp!.paidAmount).toBe(5000);
    });
  });
});
