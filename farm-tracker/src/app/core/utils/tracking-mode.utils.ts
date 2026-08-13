import { TrackingMode } from '../models/animal.model';

/** Segment defaults: goats are tracked individually, chickens as batches. */
export function defaultTrackingModeForSegment(segmentId: string): TrackingMode {
  return segmentId === 'chickens' ? 'batch' : 'individual';
}

/**
 * Resolves the tracking mode for a new animal record.
 * A count above 1 always means a batch; otherwise the user's explicit
 * choice wins, falling back to the segment default.
 */
export function resolveTrackingMode(segmentId: string, count: number, userChoice?: TrackingMode): TrackingMode {
  if (count > 1) return 'batch';
  return userChoice || defaultTrackingModeForSegment(segmentId);
}
