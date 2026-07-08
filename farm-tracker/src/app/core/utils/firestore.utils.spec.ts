import { formatCurrency } from './firestore.utils';

// Note: toTimestamp/fromTimestamp tests are skipped since they depend on
// the real @angular/fire/firestore Timestamp class. formatCurrency is
// the critical pure function to test.

describe('firestore.utils', () => {
  describe('formatCurrency', () => {
    it('should format zero', () => {
      const result = formatCurrency(0);
      expect(result).toContain('0');
    });

    it('should format positive integer', () => {
      const result = formatCurrency(1000);
      expect(result).toContain('1,000');
    });

    it('should format large number with Indian grouping', () => {
      const result = formatCurrency(1234567);
      // Indian numbering: 12,34,567
      expect(result).toContain('12,34,567');
    });

    it('should include INR symbol', () => {
      const result = formatCurrency(100);
      // Should contain rupee symbol
      expect(result).toMatch(/₹/);
    });

    it('should handle negative numbers', () => {
      const result = formatCurrency(-500);
      expect(result).toContain('500');
    });

    it('should handle decimals up to 2 places', () => {
      const result = formatCurrency(99.99);
      expect(result).toContain('99.99');
    });

    it('should not show unnecessary decimal places', () => {
      const result = formatCurrency(100);
      expect(result).not.toContain('.00');
    });
  });
});
