import { defaultTrackingModeForSegment, resolveTrackingMode } from './tracking-mode.utils';

describe('tracking-mode utils', () => {
  describe('defaultTrackingModeForSegment', () => {
    it('defaults goats to individual', () => {
      expect(defaultTrackingModeForSegment('goats')).toBe('individual');
    });

    it('defaults chickens to batch', () => {
      expect(defaultTrackingModeForSegment('chickens')).toBe('batch');
    });

    it('defaults unknown segments to individual', () => {
      expect(defaultTrackingModeForSegment('ducks')).toBe('individual');
    });
  });

  describe('resolveTrackingMode', () => {
    it('forces batch when count is above 1, regardless of choice', () => {
      expect(resolveTrackingMode('goats', 5)).toBe('batch');
      expect(resolveTrackingMode('goats', 2, 'individual')).toBe('batch');
    });

    it('honors the user choice at count 1', () => {
      expect(resolveTrackingMode('chickens', 1, 'individual')).toBe('individual');
      expect(resolveTrackingMode('goats', 1, 'batch')).toBe('batch');
    });

    it('falls back to the segment default at count 1 without a choice', () => {
      expect(resolveTrackingMode('goats', 1)).toBe('individual');
      expect(resolveTrackingMode('chickens', 1)).toBe('batch');
    });
  });
});
