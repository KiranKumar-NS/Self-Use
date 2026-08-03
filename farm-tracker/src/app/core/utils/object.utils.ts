import { Timestamp } from '@angular/fire/firestore';

/**
 * Recursively drop keys whose value is `undefined` from plain objects and arrays.
 * Firestore is initialised without `ignoreUndefinedProperties`, so any nested
 * `undefined` (e.g. inside an array of sale entries) makes `updateDoc`/`setDoc` throw.
 * Timestamps, Dates and other class instances are left untouched.
 */
export function stripUndefinedDeep<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map(v => stripUndefinedDeep(v)) as unknown as T;
  }
  // Only recurse into plain objects — leave Timestamp/Date/other class instances alone.
  if (
    typeof value === 'object' &&
    !(value instanceof Timestamp) &&
    !(value instanceof Date) &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      if (v === undefined) continue;
      out[k] = stripUndefinedDeep(v);
    }
    return out as T;
  }
  return value;
}
