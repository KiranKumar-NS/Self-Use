import { RelativeTimePipe } from './relative-time.pipe';

vi.mock('@angular/fire/firestore', () => ({
  Timestamp: class {
    static fromDate(d: Date) { return { toDate: () => d }; }
    static now() { return { toDate: () => new Date() }; }
  },
}));

describe('RelativeTimePipe', () => {
  let pipe: RelativeTimePipe;

  beforeEach(() => {
    pipe = new RelativeTimePipe();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return empty string for null', () => {
    expect(pipe.transform(null)).toBe('');
  });

  it('should return "Just now" for less than 60 seconds ago', () => {
    const date = new Date('2026-07-01T11:59:30Z');
    expect(pipe.transform(date)).toBe('Just now');
  });

  it('should return minutes ago', () => {
    const date = new Date('2026-07-01T11:55:00Z');
    expect(pipe.transform(date)).toBe('5m ago');
  });

  it('should return hours ago', () => {
    const date = new Date('2026-07-01T09:00:00Z');
    expect(pipe.transform(date)).toBe('3h ago');
  });

  it('should return days ago', () => {
    const date = new Date('2026-06-29T12:00:00Z');
    expect(pipe.transform(date)).toBe('2d ago');
  });

  it('should return formatted date for > 7 days', () => {
    const date = new Date('2026-06-15T12:00:00Z');
    const result = pipe.transform(date);
    // Should be a locale date string, not relative
    expect(result).not.toContain('ago');
  });

  it('should handle Timestamp-like objects', () => {
    const timestamp = { toDate: () => new Date('2026-07-01T11:55:00Z') };
    expect(pipe.transform(timestamp as any)).toBe('5m ago');
  });

  it('should handle Date objects', () => {
    const date = new Date('2026-07-01T11:55:00Z');
    expect(pipe.transform(date)).toBe('5m ago');
  });
});
