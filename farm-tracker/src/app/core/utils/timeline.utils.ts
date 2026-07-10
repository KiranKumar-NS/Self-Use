import { TimelineEntry } from '../models/transaction.model';

export const TIMELINE_MAX_ENTRIES = 50;

/**
 * Appends a timeline entry while keeping the array bounded (Firestore docs
 * max out at 1 MiB and rules enforce a size backstop). The original
 * 'created' entry is always preserved; the oldest edits are dropped.
 */
export function appendTimelineCapped(
  existing: TimelineEntry[] | undefined,
  entry: TimelineEntry,
  max = TIMELINE_MAX_ENTRIES
): TimelineEntry[] {
  const timeline = [...(existing ?? []), entry];
  if (timeline.length <= max) return timeline;

  const created = timeline.find(e => e.action === 'created');
  const rest = timeline.filter(e => e !== created);
  const keep = rest.slice(rest.length - (max - (created ? 1 : 0)));
  return created ? [created, ...keep] : keep;
}
