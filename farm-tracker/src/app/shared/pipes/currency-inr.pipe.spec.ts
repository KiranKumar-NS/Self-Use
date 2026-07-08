import { CurrencyInrPipe } from './currency-inr.pipe';

// We need to mock Firestore's Timestamp since the pipe imports from firestore.utils
// which imports Timestamp
vi.mock('@angular/fire/firestore', () => ({
  Timestamp: {
    fromDate: (d: Date) => ({ toDate: () => d }),
    now: () => ({ toDate: () => new Date() }),
  },
}));

describe('CurrencyInrPipe', () => {
  let pipe: CurrencyInrPipe;

  beforeEach(() => {
    pipe = new CurrencyInrPipe();
  });

  it('should format null as zero', () => {
    const result = pipe.transform(null);
    expect(result).toContain('0');
  });

  it('should format undefined as zero', () => {
    const result = pipe.transform(undefined);
    expect(result).toContain('0');
  });

  it('should format zero', () => {
    const result = pipe.transform(0);
    expect(result).toContain('0');
  });

  it('should format positive number with INR symbol', () => {
    const result = pipe.transform(1000);
    expect(result).toMatch(/₹/);
    expect(result).toContain('1,000');
  });

  it('should format large number with Indian grouping', () => {
    const result = pipe.transform(1234567);
    expect(result).toContain('12,34,567');
  });

  it('should format negative number', () => {
    const result = pipe.transform(-500);
    expect(result).toContain('500');
  });

  it('should handle decimal values', () => {
    const result = pipe.transform(99.5);
    expect(result).toContain('99.5');
  });
});
