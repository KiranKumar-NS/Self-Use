/**
 * Reusable sorting and pagination helpers for data tables.
 *
 * Usage in a component:
 *   sortColumn = '';
 *   sortDirection: SortDirection = 'asc';
 *   pageSize = 20;
 *   currentPage = 1;
 *
 *   // Call sortData(items, ...) to sort, then paginate(sorted, ...) to slice.
 */

export type SortDirection = 'asc' | 'desc';

/** Sort an array by column, handling Firestore Timestamps (date fields) and strings. */
export function sortData<T>(items: T[], column: string, direction: SortDirection): T[] {
  if (!column) return items;
  return [...items].sort((a, b) => {
    let valA: any, valB: any;
    if (column === 'date') {
      valA = (a as any).date?.toMillis?.() ?? 0;
      valB = (b as any).date?.toMillis?.() ?? 0;
    } else {
      valA = (a as any)[column];
      valB = (b as any)[column];
    }
    if (typeof valA === 'string') {
      valA = valA.toLowerCase();
      valB = (valB || '').toLowerCase();
    }
    const cmp = valA < valB ? -1 : valA > valB ? 1 : 0;
    return direction === 'asc' ? cmp : -cmp;
  });
}

/** Toggle sort state: same column flips direction, new column resets to asc. */
export function toggleSortState(
  current: { column: string; direction: SortDirection },
  clickedColumn: string,
): { column: string; direction: SortDirection } {
  if (current.column === clickedColumn) {
    return { column: clickedColumn, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { column: clickedColumn, direction: 'asc' };
}

/** Return sort icon for column header. */
export function getSortIndicator(activeColumn: string, direction: SortDirection, column: string): string {
  if (activeColumn !== column) return '↕';
  return direction === 'asc' ? '↑' : '↓';
}

/** Slice a sorted array for the current page. */
export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

/** Total number of pages. */
export function totalPages(itemCount: number, pageSize: number): number {
  return Math.max(1, Math.ceil(itemCount / pageSize));
}

/** 1-based start index for display ("1–20 of 100"). */
export function pageStart(itemCount: number, page: number, pageSize: number): number {
  return itemCount === 0 ? 0 : (page - 1) * pageSize + 1;
}

/** End index for display. */
export function pageEnd(itemCount: number, page: number, pageSize: number): number {
  return Math.min(page * pageSize, itemCount);
}
