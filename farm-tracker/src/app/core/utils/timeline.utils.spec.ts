import { appendTimelineCapped, TIMELINE_MAX_ENTRIES } from './timeline.utils';
import { TimelineEntry } from '../models/transaction.model';

function entry(action: TimelineEntry['action'], marker: string): TimelineEntry {
  return { action, by: marker, byName: marker, at: { toDate: () => new Date() } as any };
}

describe('appendTimelineCapped', () => {
  it('appends when under the cap', () => {
    const existing = [entry('created', 'c'), entry('updated', 'u1')];
    const result = appendTimelineCapped(existing, entry('updated', 'u2'));
    expect(result).toHaveLength(3);
    expect(result[2].by).toBe('u2');
  });

  it('handles undefined existing timeline', () => {
    const result = appendTimelineCapped(undefined, entry('created', 'c'));
    expect(result).toHaveLength(1);
  });

  it('caps at the max and preserves the created entry', () => {
    const existing: TimelineEntry[] = [entry('created', 'c')];
    for (let i = 0; i < TIMELINE_MAX_ENTRIES + 20; i++) {
      existing.push(entry('updated', `u${i}`));
    }
    const result = appendTimelineCapped(existing, entry('updated', 'newest'));
    expect(result).toHaveLength(TIMELINE_MAX_ENTRIES);
    expect(result[0].action).toBe('created');
    expect(result[result.length - 1].by).toBe('newest');
  });

  it('drops the oldest non-created entries first', () => {
    const existing: TimelineEntry[] = [entry('created', 'c')];
    for (let i = 0; i < 60; i++) existing.push(entry('updated', `u${i}`));
    const result = appendTimelineCapped(existing, entry('updated', 'newest'), 10);
    expect(result).toHaveLength(10);
    expect(result[0].by).toBe('c');
    expect(result.map(e => e.by)).not.toContain('u0');
    expect(result[result.length - 1].by).toBe('newest');
  });

  it('caps without a created entry', () => {
    const existing: TimelineEntry[] = [];
    for (let i = 0; i < 12; i++) existing.push(entry('updated', `u${i}`));
    const result = appendTimelineCapped(existing, entry('updated', 'newest'), 5);
    expect(result).toHaveLength(5);
    expect(result[result.length - 1].by).toBe('newest');
  });
});
