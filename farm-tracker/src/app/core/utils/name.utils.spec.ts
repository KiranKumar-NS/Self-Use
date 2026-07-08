import { normalizeName, nameKey } from './name.utils';

describe('name.utils', () => {
  describe('normalizeName', () => {
    it('should title-case a simple name', () => {
      expect(normalizeName('raju')).toBe('Raju');
    });

    it('should title-case multiple words', () => {
      expect(normalizeName('raju sharma')).toBe('Raju Sharma');
    });

    it('should trim leading and trailing whitespace', () => {
      expect(normalizeName('  raju  ')).toBe('Raju');
    });

    it('should collapse multiple spaces', () => {
      expect(normalizeName('  raju  sharma ')).toBe('Raju Sharma');
    });

    it('should handle all uppercase input', () => {
      expect(normalizeName('RAJU SHARMA')).toBe('Raju Sharma');
    });

    it('should handle mixed case input', () => {
      expect(normalizeName('rAjU sHaRmA')).toBe('Raju Sharma');
    });

    it('should handle single character', () => {
      expect(normalizeName('a')).toBe('A');
    });
  });

  describe('nameKey', () => {
    it('should lowercase and trim', () => {
      expect(nameKey('Raju Sharma')).toBe('raju sharma');
    });

    it('should collapse multiple spaces', () => {
      expect(nameKey('  Raju   Sharma  ')).toBe('raju sharma');
    });

    it('should produce same key for different casings', () => {
      expect(nameKey('RAJU')).toBe(nameKey('raju'));
    });
  });
});
