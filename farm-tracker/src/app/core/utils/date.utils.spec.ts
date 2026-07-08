import {
  getMonthString,
  getYear,
  formatDate,
  getMonthName,
  getLast6MonthsFrom,
  shiftMonth,
  getMonthRange,
} from './date.utils';

describe('date.utils', () => {
  describe('getMonthString', () => {
    it('should return YYYY-MM for January', () => {
      expect(getMonthString(new Date(2026, 0, 15))).toBe('2026-01');
    });

    it('should return YYYY-MM for December', () => {
      expect(getMonthString(new Date(2026, 11, 31))).toBe('2026-12');
    });

    it('should pad single-digit months', () => {
      expect(getMonthString(new Date(2026, 2, 1))).toBe('2026-03');
    });

    it('should not pad double-digit months', () => {
      expect(getMonthString(new Date(2026, 9, 1))).toBe('2026-10');
    });
  });

  describe('getYear', () => {
    it('should return the full year', () => {
      expect(getYear(new Date(2026, 5, 1))).toBe(2026);
    });
  });

  describe('formatDate', () => {
    it('should format date in en-IN locale', () => {
      const result = formatDate(new Date(2026, 0, 15));
      // en-IN short month format
      expect(result).toContain('2026');
      expect(result).toContain('15');
    });
  });

  describe('getMonthName', () => {
    it('should convert YYYY-MM to full month name and year', () => {
      const result = getMonthName('2026-01');
      expect(result).toContain('January');
      expect(result).toContain('2026');
    });

    it('should handle December', () => {
      const result = getMonthName('2026-12');
      expect(result).toContain('December');
    });
  });

  describe('getLast6MonthsFrom', () => {
    it('should return 6 months ending at the given month', () => {
      const months = getLast6MonthsFrom('2026-06');
      expect(months).toHaveLength(6);
      expect(months[0]).toBe('2026-01');
      expect(months[5]).toBe('2026-06');
    });

    it('should cross year boundary', () => {
      const months = getLast6MonthsFrom('2026-02');
      expect(months).toHaveLength(6);
      expect(months[0]).toBe('2025-09');
      expect(months[5]).toBe('2026-02');
    });

    it('should handle January base month', () => {
      const months = getLast6MonthsFrom('2026-01');
      expect(months[0]).toBe('2025-08');
      expect(months[5]).toBe('2026-01');
    });
  });

  describe('shiftMonth', () => {
    it('should shift forward by 1 month', () => {
      expect(shiftMonth('2026-03', 1)).toBe('2026-04');
    });

    it('should shift backward by 1 month', () => {
      expect(shiftMonth('2026-03', -1)).toBe('2026-02');
    });

    it('should cross year boundary forward', () => {
      expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    });

    it('should cross year boundary backward', () => {
      expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    });

    it('should handle large shifts', () => {
      expect(shiftMonth('2026-06', -12)).toBe('2025-06');
    });
  });

  describe('getMonthRange', () => {
    it('should return range of months inclusive', () => {
      const range = getMonthRange('2026-01', '2026-04');
      expect(range).toEqual(['2026-01', '2026-02', '2026-03', '2026-04']);
    });

    it('should handle single month range', () => {
      const range = getMonthRange('2026-06', '2026-06');
      expect(range).toEqual(['2026-06']);
    });

    it('should cross year boundary', () => {
      const range = getMonthRange('2025-11', '2026-02');
      expect(range).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    });

    it('should return empty for reversed range', () => {
      const range = getMonthRange('2026-06', '2026-01');
      expect(range).toEqual([]);
    });
  });
});
